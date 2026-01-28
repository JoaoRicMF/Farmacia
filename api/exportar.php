<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

session_start();
ob_start();

require_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    exit('Acesso negado');
}

try {
    $dbInstance = new Database();
    $db = $dbInstance->getConnection();

    // Captura o parâmetro 'mes' (esperado formato YYYY-MM)
    $mesFiltro = $_GET['mes'] ?? null;
    $sql = "SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro";
    $params = [];

    // Aplica o filtro se o parâmetro existir e não estiver vazio
    if ($mesFiltro) {
        $sql .= " WHERE DATE_FORMAT(vencimento, '%Y-%m') = :mes";
        $params[':mes'] = $mesFiltro;
    }

    $sql .= " ORDER BY vencimento";

    // Usa prepare/execute para segurança
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    ob_end_clean();

    header('Content-Type: text/csv; charset=utf-8');
    // Adiciona o mês ao nome do arquivo se filtrado
    $filename = 'financeiro_' . ($mesFiltro ?: date('Y-m-d')) . '.csv';
    header('Content-Disposition: attachment; filename=' . $filename);

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM para Excel

    fputcsv($output, ['ID', 'Vencimento', 'Descrição', 'Valor', 'Categoria', 'Status', 'Código Barras'], ';');

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $row['valor'] = number_format((float)$row['valor'], 2, ',', '.');
        fputcsv($output, $row, ';');
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(["error" => true, "message" => "Erro ao gerar CSV."]);
    exit;
}