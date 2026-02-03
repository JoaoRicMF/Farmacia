<?php
// api/fluxo.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

ob_start();
header("Content-Type: application/json; charset=UTF-8");
session_start();

require_once '../config/database.php';

// Verificação de Segurança
if (!isset($_SESSION['user_id'])) {
    ob_clean();
    http_response_code(401);
    echo json_encode(["message" => "Não autorizado"]);
    exit;
}

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
$userId = $_SESSION['user_id'];

// --- POST: SALVAR MOVIMENTAÇÃO ---
if ($method === 'POST' && $action === 'salvar') {
    $rawInput = file_get_contents("php://input");
    $data = json_decode($rawInput);

    if (!$data || !isset($data->tipo) || !isset($data->valor) || !isset($data->data_registro)) {
        echo json_encode(["success" => false, "message" => "Dados incompletos"]);
        exit;
    }

    try {
        if ($data->tipo === 'ENTRADA') {
            // Altere a query para incluir a coluna descricao
            $sql = "INSERT INTO EntradaCaixa (dataRegistro, formaPagamento, descricao, valor, id) 
            VALUES (:data, :forma, :desc, :valor, :user)";
            $stmt = $db->prepare($sql);
            $stmt->execute([
                ":data"  => $data->data_registro,
                ":forma" => $data->forma_pagamento ?? 'Dinheiro',
                ":desc"  => $data->descricao, // Agora grava a descrição enviada pelo front
                ":valor" => $data->valor,
                ":user"  => $userId
            ]);
        } else {
            $sql = "INSERT INTO SaidaCaixa (dataRegistro, descricao, valor, id) VALUES (:data, :desc, :valor, :user)";
            $stmt = $db->prepare($sql);
            $stmt->execute([
                ":data"  => $data->data_registro,
                ":desc"  => $data->descricao,
                ":valor" => $data->valor,
                ":user"  => $userId
            ]);
        }
        echo json_encode(["success" => true]);
    } catch (PDOException $e) {
        echo json_encode(["success" => false, "message" => "Erro SQL: " . $e->getMessage()]);
    }
    exit;
}

// --- GET: LISTAR FLUXO ---
if ($method === 'GET') {
    $mes = $_GET['mes'] ?? date('Y-m');
    if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
        $mes = date('Y-m');
    }
    list($ano, $mesNum) = explode('-', $mes);

    try {
        // 1. Entradas de Caixa
        $stmt = $db->prepare("SELECT id as id, dataRegistro as data, descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Saídas de Caixa
        $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Sangria/Despesa' as categoria FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 3. Contas Pagas (Financeiro)
        $stmt = $db->prepare("SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 4. Detalhamento por Forma de Pagamento (Entradas)
        // Agrupa por formaPagamento para exibir "Din: X | Pix: Y"
        $stmtTotais = $db->prepare("
            SELECT formaPagamento, SUM(valor) as total
            FROM EntradaCaixa
            WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a
            GROUP BY formaPagamento
        ");
        $stmtTotais->execute([':m' => $mesNum, ':a' => $ano]);
        $formas = $stmtTotais->fetchAll(PDO::FETCH_KEY_PAIR);

        // Mescla movimentos para tabela
        $movimentacoes = array_merge($entradas, $saidas, $pagos);
        usort($movimentacoes, function($a, $b) {
            return strtotime($b['data']) - strtotime($a['data']);
        });

        $totalEnt = 0;
        $totalSai = 0;

        foreach ($movimentacoes as &$mov) {
            $val = floatval($mov['valor']);
            $mov['valor_fmt'] = "R$ " . number_format($val, 2, ',', '.');
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
            "saldo_fmt" => "R$ " . number_format($totalEnt - $totalSai, 2, ',', '.'),
            // Totais Específicos para o Dashboard
            "total_dinheiro" => "R$ " . number_format($formas['Dinheiro'] ?? 0, 2, ',', '.'),
            "total_pix"      => "R$ " . number_format($formas['PIX'] ?? 0, 2, ',', '.'),
            "total_cartao"   => "R$ " . number_format($formas['Cartão'] ?? 0, 2, ',', '.')
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Erro ao buscar dados: " . $e->getMessage()]);
    }
}