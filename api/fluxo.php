<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// SALVAR MOVIMENTAÇÃO (Entrada ou Saída de Caixa)
if ($method === 'POST' && $action === 'salvar') {
    $data = json_decode(file_get_contents("php://input"));

    if ($data->tipo === 'ENTRADA') {
        $sql = "INSERT INTO EntradaCaixa (valor, formaPagamento, dataRegistro, usuario) VALUES (:v, :f, :d, :u)";
        $desc = "Venda/Entrada";
    } else {
        $sql = "INSERT INTO SaidaCaixa (valor, descricao, formaPagamento, dataRegistro, usuario) VALUES (:v, :desc, 'Dinheiro', :d, :u)";
    }

    $stmt = $db->prepare($sql);
    $params = [
        ":v" => $data->valor,
        ":d" => $data->data,
        ":u" => $_SESSION['user_nome'] ?? 'Sistema'
    ];

    if ($data->tipo === 'ENTRADA') {
        $params[":f"] = $data->descricao; // O frontend manda 'Dinheiro', 'Pix' etc no campo descricao/forma
    } else {
        $params[":desc"] = $data->descricao;
    }

    if ($stmt->execute($params)) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false]);
    }
    exit;
}

// LISTAR FLUXO (EXTRATO)
if ($method === 'GET') {
    $mes = $_GET['mes'] ?? date('Y-m'); // YYYY-MM
    list($ano, $mesNum) = explode('-', $mes);

    // Buscar Entradas
    $stmt = $db->prepare("SELECT id, dataRegistro as data, formaPagamento as descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Buscar Saídas de Caixa
    $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Sangria/Despesa' as categoria FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Buscar Boletos Pagos (Saídas Financeiras)
    $stmt = $db->prepare("SELECT id, COALESCE(dataProcessamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(dataProcessamento, vencimento)) = :m AND YEAR(COALESCE(dataProcessamento, vencimento)) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $movimentacoes = array_merge($entradas, $saidas, $pagos);

    // Ordenar por data
    usort($movimentacoes, function($a, $b) {
        return strtotime($b['data']) - strtotime($a['data']);
    });

    // Totais
    $totalEnt = 0;
    $totalSai = 0;

    foreach ($movimentacoes as &$mov) {
        $mov['valor_fmt'] = "R$ " . number_format($mov['valor'], 2, ',', '.');
        if ($mov['tipo'] == 'ENTRADA') $totalEnt += $mov['valor'];
        else $totalSai += $mov['valor'];
    }

    echo json_encode([
        "movimentacoes" => $movimentacoes,
        "total_entradas_fmt" => "R$ " . number_format($totalEnt, 2, ',', '.'),
        "total_saidas_fmt" => "R$ " . number_format($totalSai, 2, ',', '.'),
        "saldo_fmt" => "R$ " . number_format($totalEnt - $totalSai, 2, ',', '.')
    ]);
}
?>