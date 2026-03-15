<?php
// api/dashboard.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1); 
error_reporting(E_ALL);

verificarAuth();

$httpCode = 200;

try {
    $dbClass = new Database();
    $db = $dbClass->getConnection();

    $periodo = $_GET['periodo'] ?? '7d';
    $idUnidade = $_SESSION['id_unidade_ativa'] ?? null;
    if (!$idUnidade) {
        enviarResponse(["success" => false, "message" => "Nenhuma unidade ativa na sessão."], 403);
        exit;
    }

    // Definição da data de corte
    $dataInicio = date('Y-m-d');
    if ($periodo == '7d') $dataInicio = date('Y-m-d', strtotime('-7 days'));
    elseif ($periodo == '30d') $dataInicio = date('Y-m-d', strtotime('-30 days'));
    elseif ($periodo == '3m') $dataInicio = date('Y-m-d', strtotime('-90 days'));
    elseif ($periodo == '1y') $dataInicio = date('Y-m-d', strtotime('-365 days'));
    elseif ($periodo == 'all') $dataInicio = '1900-01-01';

    // --- CORREÇÃO 1: Consultar a tabela correta (entradacaixa) filtrada pelo período ---
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM entradacaixa WHERE id_unidade = :u AND DATE(dataRegistro) >= :inicio");
    $stmt->execute([':u' => $idUnidade, ':inicio' => $dataInicio]);
    $entradasMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // --- CORREÇÃO 2: Tabela em minúsculo (saidacaixa) filtrada pelo período ---
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM saidacaixa WHERE id_unidade = :u AND DATE(dataRegistro) >= :inicio");
    $stmt->execute([':u' => $idUnidade, ':inicio' => $dataInicio]);
    $saidasCaixaMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // --- CORREÇÃO 3: Tabela em minúsculo (financeiro) filtrada pelo período ---
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM financeiro WHERE id_unidade = :u AND status = 'Pago' AND DATE(data_processamento) >= :inicio");
    $stmt->execute([':u' => $idUnidade, ':inicio' => $dataInicio]);
    $contasPagasMes = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // Totais Consolidados
    $totalSaidasMes = $saidasCaixaMes; 
    $saldoMes = $entradasMes - $totalSaidasMes;

    $cards = [];

    // --- CORREÇÃO: Tabela financeiro em minúsculo em todas as queries abaixo ---

    // A Pagar
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM financeiro WHERE id_unidade = :u AND status != 'Pago' AND status != 'Cancelado'");
    $stmt->execute([':u' => $idUnidade]);
    $cards['pagar_mes'] = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // Pagos Mês
    $cards['pago_mes'] = $contasPagasMes;

    // Vencidos
    $stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM financeiro WHERE id_unidade = :u AND status != 'Pago' AND vencimento < CURRENT_DATE()");
    $stmt->execute([':u' => $idUnidade]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    $cards['vencidos_val'] = (float)($res['val'] ?? 0);
    $cards['vencidos_qtd'] = (int)($res['qtd'] ?? 0);

    // Próximos 7 dias
    $stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM financeiro WHERE id_unidade = :u AND status != 'Pago' AND vencimento >= CURRENT_DATE() AND vencimento <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)");
    $stmt->execute([':u' => $idUnidade]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    $cards['proximos_val'] = (float)($res['val'] ?? 0);
    $cards['proximos_qtd'] = (int)($res['qtd'] ?? 0);

    $cards['entradas_mes'] = $entradasMes;
    $cards['saidas_totais_mes'] = $totalSaidasMes;
    $cards['saldo_mes'] = $saldoMes;

    // Gráficos (financeiro minúsculo)
    $sqlMes = "SELECT DATE_FORMAT(vencimento, '%m/%Y') as mes, SUM(valor) as total 
               FROM financeiro 
               WHERE id_unidade = :u AND vencimento >= :inicio 
               GROUP BY DATE_FORMAT(vencimento, '%m/%Y') 
               ORDER BY MIN(vencimento)";
    $stmt = $db->prepare($sqlMes);
    $stmt->bindParam(":inicio", $dataInicio);
    $stmt->bindParam(":u", $idUnidade, PDO::PARAM_INT);
    $stmt->execute();
    $graficoMes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Categorias (financeiro minúsculo)
    $sqlCat = "SELECT categoria, SUM(valor) as total 
               FROM financeiro 
               WHERE id_unidade = :u AND vencimento >= :inicio 
               GROUP BY categoria";
    $stmt = $db->prepare($sqlCat);
    $stmt->bindParam(":inicio", $dataInicio);
    $stmt->bindParam(":u", $idUnidade, PDO::PARAM_INT);
    $stmt->execute();
    $graficoCat = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calendário (financeiro minúsculo)
    $calInicio = date('Y-m-01');
    $calFim = date('Y-m-d', strtotime('+60 days'));
    $sqlCal = "SELECT id, descricao, valor, vencimento, status 
               FROM financeiro 
               WHERE id_unidade = :u AND vencimento >= :inicio AND vencimento <= :fim
               ORDER BY vencimento";
    $stmt = $db->prepare($sqlCal);
    $stmt->bindParam(":inicio", $calInicio);
    $stmt->bindParam(":fim", $calFim);
    $stmt->bindParam(":u", $idUnidade, PDO::PARAM_INT);
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
?>