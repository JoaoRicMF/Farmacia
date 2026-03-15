<?php
// api/assinaturas.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");
session_start();

include_once '../config/database.php';

if (!isset($_SESSION['user_id']) || !isset($_SESSION['id_unidade_ativa'])) {
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

    $idUnidade = $_SESSION['id_unidade_ativa'];
    $categoria = $data['categoria'] ?? null;

    try {
        $db->beginTransaction();

        // 1. Guarda a assinatura para o motor adivinhar o boleto no futuro
        $stmt1 = $db->prepare("
            INSERT INTO boleto_assinaturas (assinatura, nome_fornecedor) 
            VALUES (:ass, :nome) 
            ON DUPLICATE KEY UPDATE nome_fornecedor = VALUES(nome_fornecedor)
        ");
        $stmt1->execute([':ass' => $data['assinatura'], ':nome' => $data['nome']]);

        // 2. Verifica se o fornecedor já existe na tabela de Configurações
        $stmtCheck = $db->prepare("SELECT id FROM fornecedor WHERE nome = :nome AND id_unidade = :u");
        $stmtCheck->execute([':nome' => $data['nome'], ':u' => $idUnidade]);
        
        // 3. Se não existir, cria o fornecedor oficial para aparecer nas configurações!
        if ($stmtCheck->rowCount() == 0) {
            $stmt2 = $db->prepare("INSERT INTO fornecedor (nome, categoriaPadrao, id_unidade) VALUES (:nome, :cat, :u)");
            $stmt2->execute([
                ':nome' => $data['nome'], 
                ':cat'  => $categoria, 
                ':u'    => $idUnidade
            ]);
        }

        $db->commit();
        echo json_encode(["success" => true]);

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
}