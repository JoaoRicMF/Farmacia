<?php
// api/exportar.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

session_start();
ob_start();

require_once '../config/database.php';

// Verificação de Segurança
if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    exit('Acesso negado');
}

try {
    $dbInstance = new Database();
    $db = $dbInstance->getConnection();

    // ... (Lógica de query existente mantém-se igual) ...
    $mesFiltro = $_GET['mes'] ?? null;
    $tipo = $_GET['tipo'] ?? 'financeiro';

    // QUERY BUILDER (Mantido da lógica original ou da correção anterior)
    if ($tipo === 'fluxo') {
        // Lógica de Fluxo (se já implementada) ou Financeiro padrão
        // ... (código da query de fluxo)
        $filename = 'fluxo_caixa_' . ($mesFiltro ?: date('Y-m')) . '.csv';
    } else {
        $sql = "SELECT id, vencimento, descricao, valor, categoria, status, codigo_barras FROM Financeiro";
        $params = [];
        if ($mesFiltro) {
            $sql .= " WHERE DATE_FORMAT(vencimento, '%Y-%m') = :mes";
            $params[':mes'] = $mesFiltro;
        }
        $sql .= " ORDER BY vencimento";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $filename = 'financeiro_' . ($mesFiltro ?: date('Y-m-d')) . '.csv';
    }

    ob_end_clean(); // Limpa qualquer output anterior

    // HEADERS OTIMIZADOS PARA EXCEL/CSV
    header('Content-Encoding: UTF-8');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=' . $filename);
    header('Pragma: no-cache');
    header('Expires: 0');

    $output = fopen('php://output', 'w');

    // BOM (Byte Order Mark) para forçar o Excel a ler em UTF-8
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

    // --- MODO: FLUXO DE CAIXA CONSOLIDADO ---
    if ($tipo === 'fluxo') {
        $filename = 'fluxo_caixa_' . $mesFiltro . '.csv';
        header('Content-Disposition: attachment; filename=' . $filename);

        // Cabeçalho do CSV
        fputcsv($output, ['Data', 'Descricao', 'Categoria', 'Tipo', 'Valor'], ';');

        list($ano, $mesNum) = explode('-', $mesFiltro);

        // 1. Entradas (EntradaCaixa)
        $stmtEnt = $db->prepare("SELECT dataRegistro as data, formaPagamento as descricao, 'Vendas' as categoria, 'ENTRADA' as tipo, valor FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmtEnt->execute([':m' => $mesNum, ':a' => $ano]);
        $entradas = $stmtEnt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Saídas Manuais (SaidaCaixa)
        $stmtSai = $db->prepare("SELECT dataRegistro as data, descricao, 'Sangria/Despesa' as categoria, 'SAIDA' as tipo, valor FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmtSai->execute([':m' => $mesNum, ':a' => $ano]);
        $saidas = $stmtSai->fetchAll(PDO::FETCH_ASSOC);

        // 3. Contas Pagas (Financeiro)
        // Usa data_processamento (data real do pagamento) ou vencimento como fallback
        $stmtFin = $db->prepare("SELECT COALESCE(data_processamento, vencimento) as data, descricao, categoria, 'SAIDA' as tipo, valor FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
        $stmtFin->execute([':m' => $mesNum, ':a' => $ano]);
        $pagos = $stmtFin->fetchAll(PDO::FETCH_ASSOC);

        // Merge e Ordenação
        $dados = array_merge($entradas, $saidas, $pagos);
        usort($dados, function($a, $b) {
            return strtotime($a['data']) - strtotime($b['data']);
        });

        // Escrita das linhas
        foreach ($dados as $row) {
            $linhaCSV = [
                date('d/m/Y', strtotime($row['data'])),
                $row['descricao'],
                $row['categoria'],
                $row['tipo'],
                number_format((float)$row['valor'], 2, ',', '.')
            ];
            fputcsv($output, $linhaCSV, ';');
        }

    }
    // --- MODO: FINANCEIRO (PADRÃO ANTIGO) ---
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
            $row['vencimento'] = date('d/m/Y', strtotime($row['vencimento']));
            $row['valor'] = number_format((float)$row['valor'], 2, ',', '.');
            fputcsv($output, $row, ';');
        }
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    ob_end_clean();
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(["error" => true, "message" => "Erro ao gerar CSV: " . $e->getMessage()]);
    exit;
}