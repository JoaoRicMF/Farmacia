<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename=financeiro_farmacia_' . date('Y-m-d') . '.csv');

session_start();
// 1. Importa a conexão correta
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}

// 2. Cria a conexão e atribui à variável que o seu código espera
$db = (new Database())->getConnection();

$output = fopen('php://output', 'w');
// Adiciona o BOM para o Excel abrir com acentuação correta
fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

fputcsv($output, array('ID', 'Vencimento', 'Descrição', 'Valor', 'Categoria', 'Status'), ';');

// 3. Usa o nome correto da tabela: 'Financeiro'
$query = "SELECT id, vencimento, descricao, valor, categoria, status FROM Financeiro ORDER BY vencimento ";
$stmt = $db->prepare($query);
$stmt->execute();

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    // Formata o valor para o Excel reconhecer como número (padrão brasileiro)
    $row['valor'] = number_format($row['valor'], 2, ',', '.');
    fputcsv($output, $row, ';');
}

fclose($output);
exit;