<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401); // Unauthorized
    echo json_encode(["success" => false, "message" => "Não autorizado"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Listar categorias
try {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM Categorias ORDER BY nome ASC");
        $categorias = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($categorias);
    }

// Salvar nova categoria
    if ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));
        if (empty($data->nome)) {
            echo json_encode(["success" => false, "message" => "Nome obrigatório"]);
            exit;
        }

        $stmt = $db->prepare("INSERT INTO Categorias (nome, cor) VALUES (:nome, :cor)");
        $success = $stmt->execute([
            ':nome' => $data->nome,
            ':cor' => $data->cor ?? '#3b82f6'
        ]);

        echo json_encode(["success" => $success]);
        exit;
    }
}catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Erro no banco de dados"]);
}

// Excluir categoria
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $stmt = $db->prepare("DELETE FROM Categorias WHERE id = :id");
        echo json_encode(["success" => $stmt->execute([':id' => $id])]);
        exit;
    }
}
// --- RESTAURAR PADRÕES  ---
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'reset') {
    try {
        $db->beginTransaction();
        // Limpa categorias atuais (Cuidado: isso pode afetar registros vinculados se houver FK)
        $db->query("DELETE FROM Categorias");

        $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento'];
        $stmt = $db->prepare("INSERT INTO Categorias (nome) VALUES (:nome)");

        foreach ($padroes as $p) {
            $stmt->execute([':nome' => $p]);
        }

        $db->commit();
        echo json_encode(["success" => true]);
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
    exit;
}
?>