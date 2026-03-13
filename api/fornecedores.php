<?php
// api/fornecedores.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

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

$db = null;
try {
    $database = new Database();
    $db = $database->getConnection();
} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode(["error" => "Erro ao conectar com o banco de dados."]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

// --- GET (Listar) ---
if ($method === 'GET') {
    try {
        $stmt = $db->query("SELECT * FROM fornecedor ORDER BY nome");
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

    if (empty($data->nome)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Nome do fornecedor é obrigatório"]);
        exit;
    }

    try {
        // CORREÇÃO: Inclusão de cnpj e telefone na query de INSERT
        $stmt = $db->prepare("INSERT INTO fornecedor (nome, cnpj, telefone, categoriaPadrao, assinatura) VALUES (:n, :cnpj, :tel, :c, :ass)");

        $params = [
            ":n"    => $data->nome,
            ":cnpj" => $data->cnpj ?? null,      
            ":tel"  => $data->telefone ?? null,  
            ":c"    => $data->categoriaPadrao ?? null,
            ":ass"  => $data->assinatura ?? null
        ];

        if ($stmt->execute($params)) {
            http_response_code(201);
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
        $stmt = $db->prepare("DELETE FROM fornecedor WHERE id = :id");
        if ($stmt->execute([":id" => $id])) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false]);
        }
    } catch (PDOException $e) {
        http_response_code(409);
        echo json_encode(["success" => false, "error" => "Não é possível excluir este fornecedor pois ele possui registros vinculados."]);
    }
}