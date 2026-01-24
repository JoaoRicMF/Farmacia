<?php
header("Content-Type: application/json");
session_start();
include_once '../config/database.php';

if (!isset($_SESSION['user_id'])) { http_response_code(401); exit; }

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Listar categorias
if ($method === 'GET') {
    $stmt = $db->query("SELECT * FROM Categorias ORDER BY nome ");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
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