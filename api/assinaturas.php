<?php
// api/assinaturas.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");
session_start();

include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "Não autorizado"]);
    exit;
}

try {
    $database = new Database();
    $db = $database->getConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Erro de conexão"]);
    exit;
}

$input = file_get_contents("php://input");
$data = json_decode($input, true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($data['assinatura']) || empty($data['nome'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Dados incompletos"]);
        exit;
    }

    try {
        // Insere a nova assinatura. Se ela já existir, atualiza o nome vinculado.
        $stmt = $db->prepare("
            INSERT INTO boleto_assinaturas (assinatura, nome_fornecedor) 
            VALUES (:ass, :nome) 
            ON DUPLICATE KEY UPDATE nome_fornecedor = VALUES(nome_fornecedor)
        ");
        
        if ($stmt->execute([':ass' => $data['assinatura'], ':nome' => $data['nome']])) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "message" => "Falha ao salvar a assinatura"]);
        }
    } catch (Exception $e) {
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
}