<?php
// api/financeiro.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

session_start();
require_once '../config/database.php';

// Verificação de Segurança da Sessão
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$userNome = $_SESSION['user_nome'] ?? 'Usuário';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

// --- LISTAGEM (GET) ---
if ($method === 'GET') {
    try {
        // Filtros
        $busca = $_GET['busca'] ?? '';
        $status = $_GET['status'] ?? 'Todos';
        $cat = $_GET['categoria'] ?? 'Todas';
        $dInicio = $_GET['data_inicio'] ?? '';
        $dFim = $_GET['data_fim'] ?? '';

        // Paginação
        $pagina = isset($_GET['pagina']) ? (int)$_GET['pagina'] : 1;
        $limite = 20;
        $offset = ($pagina - 1) * $limite;

        // Construção da Query
        $sql = "SELECT * FROM Financeiro WHERE 1=1";
        $params = [];

        if (!empty($busca)) {
            $sql .= " AND (descricao LIKE :busca OR codigo_barras LIKE :busca)";
            $params[':busca'] = "%$busca%";
        }
        if ($status !== 'Todos') {
            $sql .= " AND status = :status";
            $params[':status'] = $status;
        }
        if ($cat !== 'Todas') {
            $sql .= " AND categoria = :cat";
            $params[':cat'] = $cat;
        }
        if (!empty($dInicio) && !empty($dFim)) {
            $sql .= " AND vencimento BETWEEN :dini AND :dfim";
            $params[':dini'] = $dInicio;
            $params[':dfim'] = $dFim;
        }

        // Count Total para Paginação
        $sqlCount = str_replace("SELECT *", "SELECT COUNT(*) as total", $sql);
        $stmtCount = $db->prepare($sqlCount);
        $stmtCount->execute($params);
        $totalRegs = $stmtCount->fetch(PDO::FETCH_ASSOC)['total'];
        $totalPgs = ceil($totalRegs / $limite);

        // Executa Query Final
        $sql .= " ORDER BY vencimento ASC LIMIT $limite OFFSET $offset";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'registros' => $registros,
            'total_paginas' => $totalPgs,
            'pagina_atual' => $pagina
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// --- SALVAR / EDITAR (POST) ---
if ($method === 'POST' && ($action === 'salvar' || empty($action))) {
    $data = json_decode(file_get_contents("php://input"));

    // Validação Básica
    if (empty($data->descricao) || empty($data->valor) || empty($data->vencimento)) {
        echo json_encode(['success' => false, 'message' => 'Dados incompletos']);
        exit;
    }

    try {
        if (!empty($data->id)) {
            // EDITAR
            $query = "UPDATE Financeiro SET descricao=:d, valor=:v, vencimento=:ve, categoria=:c, status=:s, codigo_barras=:cb WHERE id=:id";
            $stmt = $db->prepare($query);
            $stmt->bindValue(':id', $data->id);
            $acaoLog = "Editar Registro";
        } else {
            // NOVO
            $query = "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, status, codigo_barras) VALUES (:d, :v, :ve, :c, :s, :cb)";
            $stmt = $db->prepare($query);
            $acaoLog = "Criar Registro";
        }

        $stmt->bindValue(':d', $data->descricao);
        $stmt->bindValue(':v', $data->valor);
        $stmt->bindValue(':ve', $data->vencimento);
        $stmt->bindValue(':c', $data->categoria);
        $stmt->bindValue(':s', $data->status ?? 'Pendente');
        $stmt->bindValue(':cb', $data->codigo_barras ?? '');

        if ($stmt->execute()) {
            registrarLog($db, $userNome, $acaoLog, "Desc: {$data->descricao} | Val: {$data->valor}");
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erro SQL']);
        }
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// --- BAIXAR/PAGAR (POST) ---
if ($method === 'POST' && $action === 'baixar') {
    if (!$id) { echo json_encode(['success' => false]); exit; }

    $stmt = $db->prepare("UPDATE Financeiro SET status='Pago', data_processamento=NOW() WHERE id=:id");
    if ($stmt->execute([':id' => $id])) {
        registrarLog($db, $userNome, "Baixar Boleto", "ID: $id");
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Erro ao baixar']);
    }
    exit;
}

// --- EXCLUIR (POST ou DELETE) ---
if (($method === 'POST' && $action === 'excluir') || $method === 'DELETE') {
    $idDel = $id ?? $_GET['id'] ?? null;
    if (!$idDel) { echo json_encode(['success' => false]); exit; }

    // Busca dados antes de apagar para o log
    $stmtBusca = $db->prepare("SELECT descricao, valor FROM Financeiro WHERE id=:id");
    $stmtBusca->execute([':id' => $idDel]);
    $reg = $stmtBusca->fetch(PDO::FETCH_ASSOC);

    $stmt = $db->prepare("DELETE FROM Financeiro WHERE id=:id");
    if ($stmt->execute([':id' => $idDel])) {
        registrarLog($db, $userNome, "Excluir Registro", "ID: $idDel | {$reg['descricao']}");
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Erro ao excluir']);
    }
    exit;
}
?>