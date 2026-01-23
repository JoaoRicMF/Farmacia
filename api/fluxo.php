<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    echo json_encode(["error" => "Erro de conexão"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ... [MANTER O CÓDIGO DO POST/SALVAR IGUAL] ...
if ($method === 'POST' && $action === 'salvar') {
    // (O código original de salvar estava correto, apenas certifique-se de usar $db checado)
    // ... Copiar lógica de insert original ...
    $data = json_decode(file_get_contents("php://input"));
    // ... Lógica de Insert ...
    // Para abreviar, assumo que você manteve o original aqui
}


// LISTAR FLUXO (CORREÇÃO AQUI)
if ($method === 'GET') {
    $mes = $_GET['mes'] ?? date('Y-m'); // YYYY-MM

    // Validação para evitar erro no explode
    if (strpos($mes, '-') === false) {
        $mes = date('Y-m');
    }

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
    // Correção: Garantir que não haja ambiguidade ou erro de sintaxe SQL
    $stmt = $db->prepare("SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $movimentacoes = array_merge($entradas, $saidas, $pagos);

    // Ordenar por data
    usort($movimentacoes, function($a, $b) {
        return strtotime($b['data']) - strtotime($a['data']);
    });

    // ... [CÁLCULO DE TOTAIS MANTIDO IGUAL] ...

    // Recalcular totais aqui para garantir
    $totalEnt = 0; $totalSai = 0;
    foreach ($movimentacoes as &$mov) {
        $mov['valor_fmt'] = "R$ " . number_format((float)$mov['valor'], 2, ',', '.');
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