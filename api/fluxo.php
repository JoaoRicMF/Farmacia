<?php
// api/fluxo.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Inicia buffer para evitar output indesejado antes do JSON
ob_start();

header("Content-Type: application/json; charset=UTF-8");
session_start();

require_once '../config/database.php';

// 1. VERIFICAÇÃO DE SEGURANÇA (Centralizada)
if (!isset($_SESSION['user_id'])) {
    ob_clean(); // Limpa buffer
    http_response_code(401);
    echo json_encode(["message" => "Não autorizado"]);
    exit;
}

// 2. CONEXÃO SEGURA COM O BANCO
$db = null;
try {
    $database = new Database();
    $db = $database->getConnection();
} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode(["error" => "Erro crítico ao conectar no banco: " . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$userId = $_SESSION['user_id']; // Já garantido pela verificação do topo

// --- AÇÃO: SALVAR MOVIMENTAÇÃO (POST) ---
if ($method === 'POST' && $action === 'salvar') {
    $rawInput = file_get_contents("php://input");
    $data = json_decode($rawInput);

    if (!$data || !isset($data->tipo) || !isset($data->valor) || !isset($data->data_registro)) {
        echo json_encode(["success" => false, "message" => "Dados incompletos ou JSON inválido"]);
        exit;
    }

    try {
        if ($data->tipo === 'ENTRADA') {
            $sql = "INSERT INTO EntradaCaixa (dataRegistro, formaPagamento, valor, id) 
                    VALUES (:data, :forma, :valor, :user)";
            $stmt = $db->prepare($sql);
            $params = [
                ":data"  => $data->data_registro,
                ":forma" => $data->descricao,
                ":valor" => $data->valor,
                ":user"  => $userId
            ];
        } else {
            // SAÍDA
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

// --- AÇÃO: LISTAR FLUXO (GET) ---
if ($method === 'GET') {
    $mes = $_GET['mes'] ?? date('Y-m');

    // Validação básica do formato YYYY-MM
    if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
        $mes = date('Y-m');
    }

    list($ano, $mesNum) = explode('-', $mes);

    try {
        // 1. Entradas de Caixa
        $stmt = $db->prepare("
            SELECT id, dataRegistro as data, formaPagamento as descricao, valor, 
            'ENTRADA' as tipo, 'Vendas' as categoria 
            FROM EntradaCaixa 
            WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a
        ");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Saídas de Caixa
        $stmt = $db->prepare("
            SELECT id, dataRegistro as data, descricao, valor, 
            'SAIDA' as tipo, 'Sangria/Despesa' as categoria 
            FROM SaidaCaixa 
            WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a
        ");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 3. Contas Pagas (Tabela Financeiro)
        // Usa COALESCE para pegar data_processamento se existir, senão usa vencimento
        $stmt = $db->prepare("
            SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 
            'SAIDA' as tipo, categoria 
            FROM Financeiro 
            WHERE status = 'Pago' 
            AND MONTH(COALESCE(data_processamento, vencimento)) = :m 
            AND YEAR(COALESCE(data_processamento, vencimento)) = :a
        ");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Mescla tudo
        $movimentacoes = array_merge($entradas, $saidas, $pagos);

        // Ordena por data (mais recente primeiro)
        usort($movimentacoes, function($a, $b) {
            return strtotime($b['data']) - strtotime($a['data']);
        });

        $totalEnt = 0;
        $totalSai = 0;

        // Formata valores
        foreach ($movimentacoes as &$mov) {
            $val = floatval($mov['valor']);
            $mov['valor_fmt'] = "R$ " . number_format($val, 2, ',', '.');

            // Garante data no formato BR para o front
            $mov['data_fmt']  = date('d/m/Y', strtotime($mov['data']));

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
        http_response_code(500);
        echo json_encode(["error" => "Erro ao buscar dados: " . $e->getMessage()]);
    }
}