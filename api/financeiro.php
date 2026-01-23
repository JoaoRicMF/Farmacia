<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

// --- BAIXAR (PAGAR) ---
if ($method === 'POST' && $id && $action === 'baixar') {
    $stmt = $db->prepare("UPDATE Financeiro SET status='Pago', data_processamento=NOW() WHERE id=:id");
    echo json_encode(["success" => $stmt->execute([':id' => $id])]);
    exit;
}

// --- EXCLUIR ---
if ($method === 'POST' && $id && $action === 'excluir') { // Mudado para POST para facilitar compatibilidade
    $stmt = $db->prepare("DELETE FROM Financeiro WHERE id=:id");
    echo json_encode(["success" => $stmt->execute([':id' => $id])]);
    exit;
}

// --- BUSCAR UM (GET ID) ---
if ($method === 'GET' && $id) {
    $stmt = $db->prepare("SELECT * FROM Financeiro WHERE id=:id");
    $stmt->execute([':id' => $id]);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
    exit;
}

// --- LISTAR COM FILTROS (GET) ---
if ($method === 'GET' && !$id) {
    $pagina = (int)($_GET['pagina'] ?? 1);
    $limit = 20;
    $offset = ($pagina - 1) * $limit;

    $busca = isset($_GET['busca']) ? "%".$_GET['busca']."%" : "%";
    $status = isset($_GET['status']) && $_GET['status'] != 'Todos' ? $_GET['status'] : null;
    $categoria = isset($_GET['categoria']) && $_GET['categoria'] != 'Todas' ? $_GET['categoria'] : null;

    // Novos filtros de data
    $dataInicio = $_GET['data_inicio'] ?? null;
    $dataFim = $_GET['data_fim'] ?? null;

    $sql = "SELECT * FROM Financeiro WHERE descricao LIKE :busca";
    $params = [":busca" => $busca];

    if ($status) {
        $sql .= " AND status = :status";
        $params[':status'] = $status;
    }
    if ($categoria) {
        $sql .= " AND categoria = :categoria";
        $params[':categoria'] = $categoria;
    }
    if ($dataInicio) {
        $sql .= " AND vencimento >= :inicio";
        $params[':inicio'] = $dataInicio;
    }
    if ($dataFim) {
        $sql .= " AND vencimento <= :fim";
        $params[':fim'] = $dataFim;
    }

    // Paginação
    $sqlTotal = str_replace("SELECT *", "SELECT COUNT(*) as total", $sql);
    $sql .= " ORDER BY vencimento ASC LIMIT $limit OFFSET $offset";

    // Executar Total
    $stmtCount = $db->prepare($sqlTotal);
    $stmtCount->execute($params);
    $totalRegs = $stmtCount->fetch()['total'];

    // Executar Registros
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "registros" => $registros,
        "total_paginas" => ceil($totalRegs / $limit),
        "pagina_atual" => $pagina
    ]);
    exit;
}

// --- SALVAR (POST) ---
if ($method === 'POST' && !$action) {
    $data = json_decode(file_get_contents("php://input"));

    $sql = (isset($data->id) || $id)
        ? "UPDATE Financeiro SET descricao=:d, valor=:v, vencimento=:ve, categoria=:c, status=:s, codigo_barras=:cb WHERE id=:id"
        : "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, status, codigo_barras) VALUES (:d, :v, :ve, :c, :s, :cb)";

    $stmt = $db->prepare($sql);
    $params = [
        ":d" => $data->descricao,
        ":v" => $data->valor,
        ":ve" => $data->vencimento,
        ":c" => $data->categoria,
        ":s" => $data->status,
        ":cb" => $data->codigo_barras ?? ''
    ];
    if (isset($data->id) || $id) $params[":id"] = $data->id ?? $id;

    if($stmt->execute($params)) echo json_encode(["success" => true]);
    else echo json_encode(["success" => false, "message" => "Erro SQL"]);
}
?>