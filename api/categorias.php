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
    $idUnidade = $_SESSION['id_unidade_ativa'] ?? null;
    if (!$idUnidade) {
        enviarResponse(["success" => false, "message" => "Nenhuma unidade ativa na sessão."], 403);
        exit;
    }

    // --- LISTAR (GET) ---
    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT * FROM categorias WHERE id_unidade = :u ORDER BY nome");
        $stmt->execute([':u' => $idUnidade]);
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    // --- AÇÕES POST (CRIAR ou RESETAR) ---
    elseif ($method === 'POST') {

        // --- RESET DE CATEGORIAS ---
        if ($action === 'reset') {
            // 1. Limpa apenas as categorias desta unidade
            $stmtDel = $db->prepare("DELETE FROM categorias WHERE id_unidade = :u");
            $stmtDel->execute([':u' => $idUnidade]);

            // 2. Insere Padrões para a unidade
            $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento', 'Marketing', 'Manutenção', 'Outros'];
            $stmt = $db->prepare("INSERT INTO categorias (nome, cor, id_unidade) VALUES (:nome, '#3b82f6', :u)");
            foreach ($padroes as $p) {
                $stmt->execute([':nome' => $p, ':u' => $idUnidade]);
            }

            registrarLog($db, $userNome, "Reset Categorias", "Unidade $idUnidade: restaurou padrões");
            $response = ["success" => true, "message" => "Categorias restauradas com sucesso."];
        }
        // --- CRIAR NOVA CATEGORIA ---
        else {
            $data = json_decode(file_get_contents("php://input"));

            if (empty($data->nome)) {
                throw new Exception("O nome da categoria é obrigatório.", 400);
            }

            // Validação de Duplicidade (escopo da unidade)
            $check = $db->prepare("SELECT COUNT(*) FROM categorias WHERE nome = :nome AND id_unidade = :u");
            $check->execute([':nome' => $data->nome, ':u' => $idUnidade]);
            if ($check->fetchColumn() > 0) {
                throw new Exception("Categoria já existente.", 409);
            }

            $stmt = $db->prepare("INSERT INTO categorias (nome, cor, id_unidade) VALUES (:nome, :cor, :u)");
            $stmt->execute([
                ':nome' => $data->nome,
                ':cor'  => $data->cor ?? '#3b82f6',
                ':u'    => $idUnidade
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

        // Garante que a categoria pertence à unidade ativa (evita manipulação de IDs)
        $stmt = $db->prepare("DELETE FROM categorias WHERE id = :id AND id_unidade = :u");
        $stmt->execute([':id' => $id, ':u' => $idUnidade]);

        if ($stmt->rowCount() === 0) {
            throw new Exception("Categoria não encontrada ou sem permissão.", 404);
        }

        registrarLog($db, $userNome, "Excluir Categoria", "ID: $id | Unidade: $idUnidade");
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