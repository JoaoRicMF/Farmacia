<?php
// api/exportar.php
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename=financeiro_farmacia_' . date('Y-m-d') . '.csv');

session_start();
include_once '../config/database.php';

// Verificação de segurança
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}

$db = (new Database())->getConnection();

// Abrir o "ficheiro" de saída
$output = fopen('php://output', 'w');

// Cabeçalhos das colunas
fputcsv($output, array('ID', 'Vencimento', 'Descricao', 'Valor', 'Categoria', 'Status', 'Codigo Barras'));

// Buscar todos os registos
$query = "SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro ORDER BY vencimento ASC";
$stmt = $db->prepare($query);
$stmt->execute();

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    // Formatar valor para o padrão Excel se necessário
    $row['valor'] = number_format($row['valor'], 2, ',', '');
    fputcsv($output, $row);
}

fclose($output);
exit;