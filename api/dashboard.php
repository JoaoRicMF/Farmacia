<?php
// api/dashboard.php
ob_start(); // 1. Inicia o buffer para segurar qualquer erro/warning

// 2. Configurações de erro (Logar no servidor, esconder do usuário)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json; charset=UTF-8");

$response = ['success' => false, 'message' => 'Erro ao carregar dashboard'];
$httpCode = 200;

try {
    if (session_status() === PHP_SESSION_NONE) session_start();

    // Verificação de Sessão
    if (!isset($_SESSION['user_id'])) {
        $httpCode = 401;
        throw new Exception("Sessão expirada");
    }

    require_once '../config/database.php';
    $database = new Database();
    $db = $database->getConnection();

    // Verifica se a conexão foi estabelecida
    if (!$db) {
        throw new Exception("Falha na conexão com o banco de dados.");
    }

    $periodo = $_GET['periodo'] ?? '7d';

    // Definição da data de corte
    $dataInicio = date('Y-m-d');
    if ($periodo == '7d') $dataInicio = date('Y-m-d', strtotime('-7 days'));
    elseif ($periodo == '30d') $dataInicio = date('Y-m-d', strtotime('-30 days'));
    elseif ($periodo == '3m') $dataInicio = date('Y-m-d', strtotime('-90 days'));
    elseif ($periodo == '1y') $dataInicio = date('Y-m-d', strtotime('-365 days'));
    elseif ($periodo == 'all') $dataInicio = '1900-01-01';

    // --- CARDS ---
    $cards = [];

    // A Pagar (Total Pendente Geral)
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM Financeiro WHERE status != 'Pago' AND status != 'Cancelado'");
    $stmt->execute();
    $cards['pagar_mes'] = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    // Pagos (Mês atual)
    $stmt = $db->prepare("SELECT SUM(valor) as total FROM Financeiro WHERE status = 'Pago' AND MONTH(vencimento) = MONTH(CURRENT_DATE()) AND YEAR(vencimento) = YEAR(CURRENT_DATE())");
    $stmt->execute();
    $cards['pago_mes'] = (float)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

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

    // --- GRÁFICOS ---
    // Por Mês
    $sqlMes = "SELECT DATE_FORMAT(vencimento, '%m/%Y') as mes, SUM(valor) as total 
               FROM Financeiro 
               WHERE vencimento >= :inicio 
               GROUP BY DATE_FORMAT(vencimento, '%Y-%m') 
               ORDER BY vencimento";
    $stmt = $db->prepare($sqlMes);
    $stmt->bindParam(":inicio", $dataInicio);
    $stmt->execute();
    $graficoMes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Por Categoria
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
        "success" => true, // Importante para o JS validar
        "cards" => $cards,
        "graficos" => [
            "por_mes" => $graficoMes,
            "por_categoria" => $graficoCat
        ],
        "calendario" => $calendario
    ];

} catch (Throwable $e) { // Captura Exception e Error
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ['success' => false, 'message' => $e->getMessage()];
    error_log("Erro Dashboard: " . $e->getMessage());
}

// 3. Limpeza Final (O Segredo)
ob_clean();
http_response_code($httpCode);
echo json_encode($response);
exit;