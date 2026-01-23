<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["message" => "Acesso negado"]);
    exit;
}

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// LISTAR OU BUSCAR
if ($method === 'GET') {
// Parâmetros do frontend: pagina, busca, status, categoria
$busca = isset($_GET['busca']) ? "%".$_GET['busca']."%" : "%";
$status = isset($_GET['status']) && $_GET['status'] != 'Todos' ? $_GET['status'] : null;

$sql = "SELECT * FROM Financeiro WHERE descricao LIKE :busca";
if ($status) $sql .= " AND status = :status";

$stmt = $db->prepare($sql);
$stmt->bindParam(":busca", $busca);
if ($status) $stmt->bindParam(":status", $status);

$stmt->execute();
$registros = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Formato de resposta igual ao do Java Page<?>
echo json_encode([
"registros" => $registros,
"total_paginas" => 1, // Simplificado para exemplo
"pagina_atual" => 1
]);
}

// SALVAR (NOVO OU EDIÇÃO)
if ($method === 'POST') {
$data = json_decode(file_get_contents("php://input"));

if (isset($data->id)) {
$sql = "UPDATE Financeiro SET descricao=:d, valor=:v, vencimento=:ve, categoria=:c, status=:s WHERE id=:id";
} else {
$sql = "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, status) VALUES (:d, :v, :ve, :c, :s)";
}

$stmt = $db->prepare($sql);
$params = [
":d" => $data->descricao,
":v" => $data->valor,
":ve" => $data->vencimento,
":c" => $data->categoria,
":s" => $data->status
];
if (isset($data->id)) $params[":id"] = $data->id;

if($stmt->execute($params)) {
echo json_encode(["success" => true]);
} else {
echo json_encode(["success" => false, "message" => "Erro ao salvar"]);
}
}
?>