<?php
// api/categorias.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

verificarAuth();

$response = [];
$httpCode = 200;

try {
    $database = new Database();
    $db = $database->getConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $userNome = $_SESSION['user_nome'] ?? 'Sistema';
    $action = $_GET['action'] ?? '';

    // --- LISTAR (GET) ---
    if ($method === 'GET') {
        $query = "SELECT * FROM Categorias ORDER BY nome";
        $stmt = $db->prepare($query);
        $stmt->execute();
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    // --- AÇÕES POST (CRIAR ou RESETAR) ---
    elseif ($method === 'POST') {

        // --- RESET DE CATEGORIAS ---
        if ($action === 'reset') {
            // 1. Limpa tabela
            $db->exec("DELETE FROM Categorias");
            // Reset do Auto Increment (opcional, dependendo do driver, mas DELETE já resolve o principal)

            // 2. Insere Padrões
            $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento', 'Marketing', 'Manutenção', 'Outros'];

            $stmt = $db->prepare("INSERT INTO Categorias (nome, cor) VALUES (:nome, '#3b82f6')");
            foreach ($padroes as $p) {
                $stmt->execute([':nome' => $p]);
            }

            registrarLog($db, $userNome, "Reset Categorias", "Restaurou categorias padrão");
            $response = ["success" => true, "message" => "Categorias restauradas com sucesso."];
        }
        // --- CRIAR NOVA CATEGORIA ---
        else {
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
                ':cor' => $data->cor ?? '#3b82f6'
            ]);

            registrarLog($db, $userNome, "Nova Categoria", "Criou: $data->nome");
            $response = ["success" => true, "message" => "Categoria criada com sucesso."];
            $httpCode = 201;
        }
    }

    // --- EXCLUIR (DELETE) ---
    elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception("ID da categoria não informado.", 400);

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