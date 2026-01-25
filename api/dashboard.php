<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
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
$cards['pagar_mes'] = (float)$stmt->fetch()['total'];

// Pagos (Mês atual)
$stmt = $db->prepare("SELECT SUM(valor) as total FROM Financeiro WHERE status = 'Pago' AND MONTH(vencimento) = MONTH(CURRENT_DATE()) AND YEAR(vencimento) = YEAR(CURRENT_DATE())");
$stmt->execute();
$cards['pago_mes'] = (float)$stmt->fetch()['total'];

// Vencidos
$stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM Financeiro WHERE status != 'Pago' AND vencimento < CURRENT_DATE()");
$stmt->execute();
$res = $stmt->fetch();
$cards['vencidos_val'] = (float)$res['val'];
$cards['vencidos_qtd'] = $res['qtd'];

// Próximos 7 dias
$stmt = $db->prepare("SELECT SUM(valor) as val, COUNT(*) as qtd FROM Financeiro WHERE status != 'Pago' AND vencimento >= CURRENT_DATE() AND vencimento <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)");
$stmt->execute();
$res = $stmt->fetch();
$cards['proximos_val'] = (float)$res['val'];
$cards['proximos_qtd'] = $res['qtd'];


// --- GRÁFICOS ---
// Por Mês
$sqlMes = "SELECT DATE_FORMAT(vencimento, '%m/%Y') as mes, SUM(valor) as total 
           FROM Financeiro 
           WHERE vencimento >= :inicio 
           GROUP BY DATE_FORMAT(vencimento, '%Y-%m') 
           ORDER BY vencimento ASC";
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

// --- CALENDÁRIO (Eventos: Este mês + Próximo) ---
$calInicio = date('Y-m-01'); // Início deste mês
$calFim = date('Y-m-d', strtotime('+60 days')); // +2 meses
$sqlCal = "SELECT id, descricao, valor, vencimento, status 
           FROM Financeiro 
           WHERE vencimento >= :inicio AND vencimento <= :fim
           ORDER BY vencimento ASC";
$stmt = $db->prepare($sqlCal);
$stmt->bindParam(":inicio", $calInicio);
$stmt->bindParam(":fim", $calFim);
$stmt->execute();
$calendario = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    "cards" => $cards,
    "graficos" => [
        "por_mes" => $graficoMes,
        "por_categoria" => $graficoCat
    ],
    "calendario" => $calendario
]);
?>