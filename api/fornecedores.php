<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Inicia o buffer para evitar que espaços em branco corrompam o JSON
ob_start();

header("Content-Type: application/json; charset=UTF-8");
session_start();

include_once '../config/database.php';

// 1. Verificação de Autenticação
if (!isset($_SESSION['user_id'])) {
    ob_clean();
    http_response_code(401);
    echo json_encode(["error" => "Não autorizado"]);
    exit;
}

// 2. Conexão Segura (Aqui estava o erro)
$db = null;
try {
    $database = new Database();
    $db = $database->getConnection();
} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    // Em produção, não envie o $e->getMessage() direto para o usuário por segurança
    echo json_encode(["error" => "Erro ao conectar com o banco de dados."]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

// --- GET (Listar) ---
if ($method === 'GET') {
    try {
        $stmt = $db->query("SELECT * FROM Fornecedor ORDER BY nome");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($result);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Erro na consulta SQL"]);
    }
}

// --- POST (Criar) ---
if ($method === 'POST') {
    $input = file_get_contents("php://input");
    $data = json_decode($input);

    // Validação básica para evitar erro de "Undefined property"
    if (empty($data->nome)) {
        http_response_code(400); // Bad Request
        echo json_encode(["success" => false, "message" => "Nome do fornecedor é obrigatório"]);
        exit;
    }

    try {
        $stmt = $db->prepare("INSERT INTO Fornecedor (nome, categoriaPadrao) VALUES (:n, :c)");
        // Usa null coalescing (??) caso categoria_padrao não seja enviada
        $params = [
            ":n" => $data->nome,
            ":c" => $data->categoria_padrao ?? null
        ];

        if ($stmt->execute($params)) {
            http_response_code(201); // Created
            echo json_encode(["success" => true, "id" => $db->lastInsertId()]);
        } else {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Falha ao inserir"]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Erro SQL: " . $e->getMessage()]);
    }
}

// --- DELETE (Remover) ---
if ($method === 'DELETE') {
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "ID não fornecido"]);
        exit;
    }

    try {
        $stmt = $db->prepare("DELETE FROM Fornecedor WHERE id = :id");
        if ($stmt->execute([":id" => $id])) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false]);
        }
    } catch (PDOException $e) {
        // Erro comum: tentar apagar fornecedor que já tem produtos vinculados (Foreign Key constraint)
        http_response_code(409); // Conflict
        echo json_encode(["success" => false, "error" => "Não é possível excluir este fornecedor pois ele possui registros vinculados."]);
    }
}