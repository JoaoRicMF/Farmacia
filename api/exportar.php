<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Mantém 0 para produção

session_start();

// Buffer de saída para evitar que espaços em branco nos includes quebrem o CSV
ob_start();

require_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    // Retorna 403 se não estiver logado
    http_response_code(403);
    exit('Acesso negado');
}

try {
    // 1. Tenta conectar ANTES de enviar cabeçalhos de arquivo
    // Se falhar aqui, cai no catch e não gera arquivo para download
    $dbInstance = new Database();
    $db = $dbInstance->getConnection();

    // 2. Prepara a query
    $stmt = $db->query("SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro ORDER BY vencimento");

    // Limpa o buffer de saída (remove qualquer echo ou espaço em branco anterior)
    ob_end_clean();

    // 3. Define os cabeçalhos apenas agora que sabemos que o banco respondeu
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=financeiro_' . date('Y-m-d') . '.csv');

    $output = fopen('php://output', 'w');

    // BOM para Excel reconhecer acentos
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

    // Cabeçalho do CSV
    fputcsv($output, ['ID', 'Vencimento', 'Descrição', 'Valor', 'Categoria', 'Status', 'Código Barras'], ';');

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Formata valor para padrão brasileiro
        $row['valor'] = number_format((float)$row['valor'], 2, ',', '.');

        // Formata data se necessário (Opcional, excel lê Y-m-d, mas visualmente d/m/Y é melhor)
        // $row['vencimento'] = date('d/m/Y', strtotime($row['vencimento']));

        fputcsv($output, $row, ';');
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    // Se der erro, limpa o buffer e retorna erro 500 (Server Error)
    ob_end_clean();
    http_response_code(500);

    // Como é uma API/Exportação, retornamos JSON ou texto simples com o erro
    header('Content-Type: application/json');
    echo json_encode([
        "error" => true,
        "message" => "Erro ao conectar no banco de dados ou gerar CSV.",
        // Em produção, evite enviar $e->getMessage() para o usuário final por segurança
        "debug" => $e->getMessage()
    ]);
    exit;
}