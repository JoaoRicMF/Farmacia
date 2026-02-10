<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

session_start();
ob_start();

require_once '../config/database.php';

// IMPORTANTE: Inclui o fluxo.php para ter acesso à função 'obterMovimentacoesFluxo'
// O 'if' que colocamos lá impede que o JSON seja gerado automaticamente.
require_once 'fluxo.php'; 

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    exit('Acesso negado');
}

try {
    $dbInstance = new Database();
    $db = $dbInstance->getConnection();

    $tipo = $_GET['tipo'] ?? 'financeiro';
    $mesFiltro = $_GET['mes'] ?? date('Y-m');

    // Cabeçalhos para Download CSV
    header('Content-Encoding: UTF-8');
    header('Content-Type: text/csv; charset=utf-8');
    header('Pragma: no-cache');
    header('Expires: 0');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8

    // --- EXPORTAÇÃO FLUXO DE CAIXA (REFATORADA) ---
    if ($tipo === 'fluxo') {
        $filename = 'fluxo_caixa_' . $mesFiltro . '.csv';
        header('Content-Disposition: attachment; filename=' . $filename);

        // Cabeçalho CSV
        fputcsv($output, ['Data', 'Descricao', 'Categoria', 'Tipo', 'Valor'], ';');

        list($ano, $mesNum) = explode('-', $mesFiltro);

        // >>> USANDO A LÓGICA CENTRALIZADA <<<
        // Agora, se mudarmos a regra no fluxo.php, o Excel atualiza automaticamente.
        $dados = obterMovimentacoesFluxo($db, $ano, $mesNum);

        // Como a função retorna decrescente (para UI), invertemos para o Excel (crescente) se desejar
        // usort($dados, function($a, $b) { return strtotime($a['data']) - strtotime($b['data']); });

        foreach ($dados as $row) {
            $linha = [
                date('d/m/Y', strtotime($row['data'])),
                $row['descricao'],
                $row['categoria'],
                $row['tipo'],
                number_format((float)$row['valor'], 2, ',', '.')
            ];
            fputcsv($output, $linha, ';');
        }
    }
    // --- EXPORTAÇÃO FINANCEIRO (Mantida igual) ---
    else {
        // ... (código existente do financeiro) ...
        $filename = 'financeiro_' . $mesFiltro . '.csv';
        header('Content-Disposition: attachment; filename=' . $filename);

        fputcsv($output, ['ID', 'Vencimento', 'Descrição', 'Valor', 'Categoria', 'Status', 'Código Barras'], ';');

        $sql = "SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro";
        $params = [];
        if ($mesFiltro) {
            $sql .= " WHERE DATE_FORMAT(vencimento, '%Y-%m') = :mes";
            $params[':mes'] = $mesFiltro;
        }
        $sql .= " ORDER BY vencimento";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['valor'] = number_format((float)$row['valor'], 2, ',', '.');
            $row['vencimento'] = date('d/m/Y', strtotime($row['vencimento']));
            fputcsv($output, $row, ';');
        }
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    ob_end_clean();
    http_response_code(500);
    echo "Erro ao gerar CSV: " . $e->getMessage();
    exit;
}
?>