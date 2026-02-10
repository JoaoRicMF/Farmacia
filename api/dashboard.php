<?php
// api/dashboard.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

verificarAuth();

// Inicializa com sucesso por padrão para evitar variável indefinida
$httpCode = 200;

try {
    $dbClass = new Database();
    $db = $dbClass->getConnection();

    $periodo = $_GET['periodo'] ?? '7d';

    // Definição da data de corte para gráficos e listagens
    $dataInicio = date('Y-m-d');
    if ($periodo == '7d') $dataInicio = date('Y-m-d', strtotime('-7 days'));
    elseif ($periodo == '30d') $dataInicio = date('Y-m-d', strtotime('-30 days'));
    elseif ($periodo == '3m') $dataInicio = date('Y-m-d', strtotime('-90 days'));
    elseif ($periodo == '1y') $dataInicio = date('Y-m-d', strtotime('-365 days'));
    elseif ($periodo == 'all') $dataInicio = '1900-01-01';

    // --- CÁLCULOS DO MÊS ATUAL (Sincronização com Fluxo) ---
    // 1. Total Entradas (EntradaCaixa) Mês Atual
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM SaidaCaixa WHERE MONTH(dataRegistro) = MONTH(CURRENT_DATE()) AND YEAR(dataRegistro) = YEAR(CURRENT_DATE())");
    $stmt->execute();
    $saidasCaixaMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // 2. Total Saídas Caixa (SaidaCaixa) Mês Atual
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM SaidaCaixa WHERE MONTH(dataRegistro) = MONTH(CURRENT_DATE()) AND YEAR(dataRegistro) = YEAR(CURRENT_DATE())");
    $stmt->execute();
    $saidasCaixaMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // 3. Total Financeiro Pago (Contas) Mês Atual
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM Financeiro WHERE status = 'Pago' AND MONTH(data_processamento) = MONTH(CURRENT_DATE()) AND YEAR(data_processamento) = YEAR(CURRENT_DATE())");
    $stmt->execute();
    $contasPagasMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // Totais Consolidados
    $totalSaidasMes = $saidasCaixaMes; 
    $saldoMes = $entradasMes - $totalSaidasMes;

    // --- CARDS ORIGINAIS (Ajustados) ---
    $cards = [];

    // A Pagar (Pendente Geral)
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM Financeiro WHERE status != 'Pago' AND status != 'Cancelado'");
    $stmt->execute();
    $cards['pagar_mes'] = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // Pagos Mês (Apenas Contas)
    $cards['pago_mes'] = $contasPagasMes;

    // Vencidos
    $stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM Financeiro WHERE status != 'Pago' AND vencimento < CURRENT_DATE()");
    $stmt->execute();
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    $cards['vencidos_val'] = (float)($res['val'] ?? 0);
    $cards['vencidos_qtd'] = (int)($res['qtd'] ?? 0);

    // Próximos 7 dias
    $stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM Financeiro WHERE status != 'Pago' AND vencimento >= CURRENT_DATE() AND vencimento <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)");
    $stmt->execute();
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    $cards['proximos_val'] = (float)($res['val'] ?? 0);
    $cards['proximos_qtd'] = (int)($res['qtd'] ?? 0);

    // Novos dados adicionados ao JSON
    $cards['entradas_mes'] = $entradasMes;
    $cards['saidas_totais_mes'] = $totalSaidasMes;
    $cards['saldo_mes'] = $saldoMes;

    // --- GRÁFICOS ---
    // Gráfico 1: Evolução Mensal
    $sqlMes = "SELECT DATE_FORMAT(vencimento, '%m/%Y') as mes, SUM(valor) as total 
               FROM Financeiro 
               WHERE vencimento >= :inicio 
               GROUP BY DATE_FORMAT(vencimento, '%Y-%m') 
               ORDER BY vencimento";
    $stmt = $db->prepare($sqlMes);
    $stmt->bindParam(":inicio", $dataInicio);
    $stmt->execute();
    $graficoMes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Gráfico 2: Categorias
    $sqlCat = "SELECT categoria, SUM(valor) as total 
               FROM Financeiro 
               WHERE vencimento >= :inicio 
               GROUP BY categoria";
    $stmt = $db->prepare($sqlCat);
    $stmt->bindParam(":inicio", $dataInicio);
    $stmt->execute();
    $graficoCat = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- CALENDÁRIO ---
    $calInicio = date('Y-m-01');
    $calFim = date('Y-m-d', strtotime('+60 days'));
    $sqlCal = "SELECT id, descricao, valor, vencimento, status 
               FROM Financeiro 
               WHERE vencimento >= :inicio AND vencimento <= :fim
               ORDER BY vencimento";
    $stmt = $db->prepare($sqlCal);
    $stmt->bindParam(":inicio", $calInicio);
    $stmt->bindParam(":fim", $calFim);
    $stmt->execute();
    $calendario = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $response = [
        "success" => true,
        "cards" => $cards,
        "graficos" => [
            "por_mes" => $graficoMes,
            "por_categoria" => $graficoCat
        ],
        "calendario" => $calendario
    ];

} catch (Exception $e) {
    $httpCode = 500;
    $response = ['success' => false, 'message' => $e->getMessage()];
}

enviarResponse($response, $httpCode);