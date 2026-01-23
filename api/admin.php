<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

// Verificação simples de admin (ajuste conforme sua lógica de roles)
if (!isset($_SESSION['user_id']) || ($_SESSION['user_funcao'] ?? '') !== 'Admin') {
    http_response_code(403);
    echo json_encode(["message" => "Acesso restrito a administradores"]);
    exit;
}

$db = (new Database())->getConnection();
$resource = $_GET['resource'] ?? '';

if ($resource === 'logs') {
    $stmt = $db->query("SELECT * FROM Log ORDER BY id DESC LIMIT 100");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($resource === 'usuarios') {
    $stmt = $db->query("SELECT id, nome, usuario as login, funcao FROM Usuario");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
}
?><?php
