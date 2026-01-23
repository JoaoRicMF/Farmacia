<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

// BAIXAR (PAGAR)
if ($method === 'POST' && $id && $action === 'baixar') {
    $stmt = $db->prepare("UPDATE Financeiro SET status='Pago', dataProcessamento=NOW() WHERE id=:id");
    if ($stmt->execute([':id' => $id])) echo json_encode(["success" => true]);
    else echo json_encode(["success" => false]);
    exit;
}

// EXCLUIR
if ($method === 'DELETE' && $id) {
    $stmt = $db->prepare("DELETE FROM Financeiro WHERE id=:id");
    if ($stmt->execute([':id' => $id])) echo json_encode(["success" => true]);
    else echo json_encode(["success" => false]);
    exit;
}

// BUSCAR UM (Para edição)
if ($method === 'GET' && $id) {
    $stmt = $db->prepare("SELECT * FROM Financeiro WHERE id=:id");
    $stmt->execute([':id' => $id]);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
    exit;
}

// LISTAR COM FILTROS (Mantido da versão anterior, com ajustes)
if ($method === 'GET' && !$id) {
    $pagina = (int)($_GET['pagina'] ?? 1); // Forçar inteiro
    $limit = 20;
    $offset = ($pagina - 1) * $limit;

    $busca = isset($_GET['busca']) ? "%".$_GET['busca']."%" : "%";
    $status = isset($_GET['status']) && $_GET['status'] != 'Todos' ? $_GET['status'] : null;
    $categoria = isset($_GET['categoria']) && $_GET['categoria'] != 'Todas' ? $_GET['categoria'] : null;

    $sql = "SELECT * FROM Financeiro WHERE descricao LIKE :busca";
    if ($status) $sql .= " AND status = :status";
    if ($categoria) $sql .= " AND categoria = :categoria";

    // Paginação
    $sqlTotal = str_replace("SELECT *", "SELECT COUNT(*) as total", $sql);

    $sql .= " ORDER BY vencimento ASC LIMIT $limit OFFSET $offset";

    $stmt = $db->prepare($sql);
    $stmt->bindValue(":busca", $busca);
    if ($status) $stmt->bindValue(":status", $status);
    if ($categoria) $stmt->bindValue(":categoria", $categoria);
    $stmt->execute();
    $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Contar total
    $stmtCount = $db->prepare($sqlTotal);
    $stmtCount->bindValue(":busca", $busca);
    if ($status) $stmtCount->bindValue(":status", $status);
    if ($categoria) $stmtCount->bindValue(":categoria", $categoria);
    $stmtCount->execute();
    $totalRegs = $stmtCount->fetch()['total'];

    echo json_encode([
        "registros" => $registros,
        "total_paginas" => ceil($totalRegs / $limit),
        "pagina_atual" => (int)$pagina
    ]);
    exit;
}

// SALVAR (POST/PUT)
if (($method === 'POST' || $method === 'PUT') && !$action) {
    $data = json_decode(file_get_contents("php://input"));

    // Log de quem salvou
    $logMsg = isset($data->id) ? "Editou registro ID {$data->id}" : "Criou novo registro: {$data->descricao}";
    // (Opcional: Inserir na tabela Log aqui)

    if (isset($data->id) || $id) {
        $sql = "UPDATE Financeiro SET descricao=:d, valor=:v, vencimento=:ve, categoria=:c, status=:s, codigoBarras=:cb WHERE id=:id";
        $execId = $data->id ?? $id;
    } else {
        $sql = "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, status, codigoBarras) VALUES (:d, :v, :ve, :c, :s, :cb)";
        $execId = null;
    }

    $stmt = $db->prepare($sql);
    $params = [
        ":d" => $data->descricao,
        ":v" => $data->valor,
        ":ve" => $data->vencimento,
        ":c" => $data->categoria,
        ":s" => $data->status,
        ":cb" => $data->codigo ?? ''
    ];
    if ($execId) $params[":id"] = $execId;

    if($stmt->execute($params)) echo json_encode(["success" => true]);
    else echo json_encode(["success" => false, "message" => "Erro SQL"]);
}
?>