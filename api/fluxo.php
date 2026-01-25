<?php
// api/fluxo.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");
session_start();
include_once '../config/database.php';

// CORREÇÃO: Verifica 'user_id' em vez de 'id' (conforme padronizado no auth.php)
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["message" => "Não autorizado"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo json_encode(["error" => "Erro de conexão"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// --- SALVAR MOVIMENTAÇÃO ---
if ($method === 'POST' && $action === 'salvar') {
    $data = json_decode(file_get_contents("php://input"));

    if (!$data->tipo || !$data->valor || !$data->data_registro) {
        echo json_encode(["success" => false, "message" => "Dados incompletos"]);
        exit;
    }

    // CORREÇÃO: Recupera o ID correto da sessão
    $userId = $_SESSION['user_id'] ?? null;

    if (!$userId) {
        echo json_encode(["success" => false, "message" => "Usuário não autenticado"]);
        exit;
    }

    try {
        if ($data->tipo === 'ENTRADA') {
            $sql = "INSERT INTO EntradaCaixa (dataRegistro, formaPagamento, valor, id) 
                    VALUES (:data, :forma, :valor, :user)";
            $stmt = $db->prepare($sql);
            $params = [
                ":data"  => $data->data_registro,
                ":forma" => $data->descricao, // Front envia 'descricao', mapeamos para 'formaPagamento'
                ":valor" => $data->valor,
                ":user"  => $userId
            ];
        } else {
            $sql = "INSERT INTO SaidaCaixa (dataRegistro, descricao, valor, id) 
                    VALUES (:data, :desc, :valor, :user)";
            $stmt = $db->prepare($sql);
            $params = [
                ":data"  => $data->data_registro,
                ":desc"  => $data->descricao,
                ":valor" => $data->valor,
                ":user"  => $userId
            ];
        }

        if ($stmt->execute($params)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "message" => "Erro ao gravar no banco"]);
        }
    } catch (PDOException $e) {
        echo json_encode(["success" => false, "message" => "Erro SQL: " . $e->getMessage()]);
    }
    exit;
}

// --- LISTAR FLUXO ---
if ($method === 'GET') {
    $mes = $_GET['mes'] ?? date('Y-m');

    if (strpos($mes, '-') === false) {
        $mes = date('Y-m');
    }

    list($ano, $mesNum) = explode('-', $mes);

    try {
        // Entradas
        $stmt = $db->prepare("SELECT id_entrada as id, dataRegistro as data, formaPagamento as descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Saídas
        $stmt = $db->prepare("SELECT id_saida as id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Sangria/Despesa' as categoria FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Pagamentos (Financeiro)
        $stmt = $db->prepare("SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $movimentacoes = array_merge($entradas, $saidas, $pagos);

        usort($movimentacoes, function($a, $b) {
            return strtotime($b['data']) - strtotime($a['data']);
        });

        $totalEnt = 0;
        $totalSai = 0;

        foreach ($movimentacoes as &$mov) {
            $val = floatval($mov['valor']);
            $mov['valor_fmt'] = "R$ " . number_format($val, 2, ',', '.');

            if ($mov['tipo'] == 'ENTRADA') {
                $totalEnt += $val;
            } else {
                $totalSai += $val;
            }
        }

        echo json_encode([
            "movimentacoes" => $movimentacoes,
            "total_entradas_fmt" => "R$ " . number_format($totalEnt, 2, ',', '.'),
            "total_saidas_fmt" => "R$ " . number_format($totalSai, 2, ',', '.'),
            "saldo_fmt" => "R$ " . number_format($totalEnt - $totalSai, 2, ',', '.')
        ]);

    } catch (PDOException $e) {
        echo json_encode(["error" => "Erro ao buscar dados: " . $e->getMessage()]);
    }
}
?>