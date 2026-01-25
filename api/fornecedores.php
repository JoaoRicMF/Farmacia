<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

if ($method === 'GET') {
    $stmt = $db->query("SELECT * FROM Fornecedor ORDER BY nome ASC");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    $stmt = $db->prepare("INSERT INTO Fornecedor (nome, categoriaPadrao) VALUES (:n, :c)");
    if ($stmt->execute([":n" => $data->nome, ":c" => $data->categoria_padrao])) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false]);
    }
}

if ($method === 'DELETE' && $id) {
    $stmt = $db->prepare("DELETE FROM Fornecedor WHERE id = :id");
    $stmt->execute([":id" => $id]);
    echo json_encode(["success" => true]);
}
?>