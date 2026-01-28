<?php
// api/categorias.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

verificarAuth(); // Valida sessão via utils

$response = [];
$httpCode = 200;

try {
    $database = new Database();
    $db = $database->getConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $userNome = $_SESSION['user_nome'] ?? 'Sistema';

    // --- LISTAR (GET) ---
    if ($method === 'GET') {
        $query = "SELECT * FROM Categorias ORDER BY nome";
        $stmt = $db->prepare($query);
        $stmt->execute();
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    // --- CRIAR (POST) ---
    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));

        if (empty($data->nome)) {
            throw new Exception("O nome da categoria é obrigatório.", 400);
        }

        // Validação de Duplicidade
        $check = $db->prepare("SELECT COUNT(*) FROM Categorias WHERE nome = :nome");
        $check->execute([':nome' => $data->nome]);
        if ($check->fetchColumn() > 0) {
            throw new Exception("Categoria já existente.", 409);
        }

        $stmt = $db->prepare("INSERT INTO Categorias (nome, cor) VALUES (:nome, :cor)");
        $stmt->execute([
            ':nome' => $data->nome,
            ':cor' => $data->cor ?? '#3b82f6' // Cor padrão azul se não enviada
        ]);

        registrarLog($db, $userNome, "Nova Categoria", "Criou: $data->nome");
        $response = ["success" => true, "message" => "Categoria criada com sucesso."];
        $httpCode = 201;
    }

    // --- EXCLUIR (DELETE) ---
    elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception("ID da categoria não informado.", 400);

        // Opcional: Verificar se está em uso antes de excluir poderia ser adicionado aqui

        $stmt = $db->prepare("DELETE FROM Categorias WHERE id = :id");
        $stmt->execute([':id' => $id]);

        registrarLog($db, $userNome, "Excluir Categoria", "ID: $id");
        $response = ["success" => true, "message" => "Categoria removida."];
    }

    else {
        throw new Exception("Método não suportado.", 405);
    }

} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

enviarResponse($response, $httpCode);