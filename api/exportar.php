<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename=financeiro_' . date('Y-m-d') . '.csv');

session_start();
require_once '../config/database.php';

if (!isset($_SESSION['user_id'])) exit;

$db = (new Database())->getConnection();
$output = fopen('php://output', 'w');

// BOM para Excel reconhecer acentos
fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

// Cabeçalho
fputcsv($output, ['ID', 'Vencimento', 'Descrição', 'Valor', 'Categoria', 'Status', 'Código Barras'], ';');

$stmt = $db->query("SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro ORDER BY vencimento");

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $row['valor'] = number_format($row['valor'], 2, ',', '.');
    fputcsv($output, $row, ';');
}
fclose($output);
