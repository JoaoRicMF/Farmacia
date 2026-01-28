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

    $tipo = $_GET['tipo'] ?? 'financeiro';
    $mesFiltro = $_GET['mes'] ?? date('Y-m');

    // Cabeçalhos para Download CSV
    header('Content-Encoding: UTF-8');
    header('Content-Type: text/csv; charset=utf-8');
    header('Pragma: no-cache');
    header('Expires: 0');

    $output = fopen('php://output', 'w');
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8

    // --- EXPORTAÇÃO FLUXO DE CAIXA ---
    if ($tipo === 'fluxo') {
        $filename = 'fluxo_caixa_' . $mesFiltro . '.csv';
        header('Content-Disposition: attachment; filename=' . $filename);

        // Cabeçalho CSV
        fputcsv($output, ['Data', 'Descricao', 'Categoria', 'Tipo', 'Valor'], ';');

        list($ano, $mesNum) = explode('-', $mesFiltro);

        // 1. Entradas
        $stmt1 = $db->prepare("SELECT dataRegistro as data, formaPagamento as descricao, 'Vendas' as categoria, 'ENTRADA' as tipo, valor FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt1->execute([':m' => $mesNum, ':a' => $ano]);

        // 2. Saídas Manuais
        $stmt2 = $db->prepare("SELECT dataRegistro as data, descricao, 'Sangria/Despesa' as categoria, 'SAIDA' as tipo, valor FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt2->execute([':m' => $mesNum, ':a' => $ano]);

        // 3. Contas Pagas
        $stmt3 = $db->prepare("SELECT COALESCE(data_processamento, vencimento) as data, descricao, categoria, 'SAIDA' as tipo, valor FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
        $stmt3->execute([':m' => $mesNum, ':a' => $ano]);

        $dados = array_merge(
            $stmt1->fetchAll(PDO::FETCH_ASSOC),
            $stmt2->fetchAll(PDO::FETCH_ASSOC),
            $stmt3->fetchAll(PDO::FETCH_ASSOC)
        );

        // Ordenar por Data
        usort($dados, function($a, $b) {
            return strtotime($a['data']) - strtotime($b['data']);
        });

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
    // --- EXPORTAÇÃO FINANCEIRO (Padrão) ---
    else {
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
    echo json_encode(["error" => true, "message" => "Erro ao gerar CSV."]);
    exit;
}