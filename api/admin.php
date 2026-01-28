<?php
// api/admin.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);

// Validação de sessão e nível ADMIN
verificarAuth();
if (($_SESSION['user_funcao'] ?? '') !== 'Admin') {
    enviarResponse(["success" => false, "message" => "Acesso restrito a Administradores."], 403);
}

$response = [];
$httpCode = 200;

try {
    $database = new Database();
    $db = $database->getConnection();

    $method = $_SERVER['REQUEST_METHOD'];
    $resource = $_GET['resource'] ?? '';
    $action = $_GET['action'] ?? '';
    $adminUser = $_SESSION['user_nome'];

    // --- LISTAR USUÁRIOS ---
    if ($method === 'GET' && $resource === 'usuarios') {
        $stmt = $db->query("SELECT id, nome, usuario, funcao FROM Usuario ORDER BY nome");
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    // --- LISTAR LOGS ---
    elseif ($method === 'GET' && $resource === 'logs') {
        $stmt = $db->query("SELECT DATE_FORMAT(dataHora, '%d/%m/%Y %H:%i') as dataHora, usuario, acao, detalhes FROM Log ORDER BY id DESC LIMIT 100");
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'));

        // --- CRIAR USUÁRIO ---
        if ($action === 'criarUsuario') {
            if (empty($data->nome) || empty($data->login) || empty($data->password)) {
                throw new Exception("Dados incompletos.", 400);
            }

            $senhaHash = password_hash($data->password, PASSWORD_DEFAULT);
            $funcao = ucfirst($data->nivel ?? 'Operador');

            $stmt = $db->prepare("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES (:n, :u, :s, :f)");
            $stmt->execute([':n' => $data->nome, ':u' => $data->login, ':s' => $senhaHash, ':f' => $funcao]);

            registrarLog($db, $adminUser, "Criar Usuário", "User: $data->login");
            $response = ['success' => true, 'message' => 'Usuário criado com sucesso'];
        }

        // --- EDITAR USUÁRIO ---
        elseif ($action === 'editar') {
            if (empty($data->id) || empty($data->nome) || empty($data->login)) {
                throw new Exception("Dados obrigatórios faltando.", 400);
            }

            // Verifica se login já existe para outro ID
            $check = $db->prepare("SELECT id FROM Usuario WHERE usuario = :u AND id != :id");
            $check->execute([':u' => $data->login, ':id' => $data->id]);
            if ($check->rowCount() > 0) throw new Exception("Este login já está em uso.", 409);

            $stmt = $db->prepare("UPDATE Usuario SET nome = :n, usuario = :u, funcao = :f WHERE id = :id");
            $stmt->execute([
                ':n' => $data->nome,
                ':u' => $data->login,
                ':f' => $data->funcao ?? 'Operador',
                ':id' => $data->id
            ]);

            registrarLog($db, $adminUser, "Editar Usuário", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Usuário atualizado.'];
        }

        // --- RESETAR SENHA ---
        elseif ($action === 'resetSenha') {
            if (empty($data->id) || empty($data->novaSenha)) {
                throw new Exception("ID e Nova Senha são obrigatórios.", 400);
            }

            $hash = password_hash($data->novaSenha, PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE Usuario SET senha = :s WHERE id = :id");
            $stmt->execute([':s' => $hash, ':id' => $data->id]);

            registrarLog($db, $adminUser, "Reset Senha", "Resetou senha do ID: $data->id");
            $response = ['success' => true, 'message' => 'Senha alterada com sucesso.'];
        }

        // --- EXCLUIR USUÁRIO ---
        elseif ($action === 'excluir') {
            if (empty($data->id)) throw new Exception("ID não fornecido.", 400);

            // Previne exclusão do próprio admin logado
            if ($data->id == $_SESSION['user_id']) {
                throw new Exception("Você não pode excluir sua própria conta.", 403);
            }

            $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
            $stmt->execute([':id' => $data->id]);

            registrarLog($db, $adminUser, "Excluir Usuário", "ID Excluído: $data->id");
            $response = ['success' => true, 'message' => 'Usuário removido.'];
        }

        else {
            throw new Exception("Ação desconhecida.", 404);
        }
    }

    // --- DELETE VIA VERBO HTTP ---
    elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception("ID inválido", 400);
        if ($id == $_SESSION['user_id']) throw new Exception("Auto-exclusão proibida", 403);

        $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
        $stmt->execute([':id' => $id]);
        registrarLog($db, $adminUser, "Excluir Usuário", "ID: $id");
        $response = ['success' => true];
    }

} catch (PDOException $e) {
    $response = ["success" => false, "message" => "Erro DB: " . (str_contains($e->getMessage(), 'Duplicate') ? "Dados duplicados." : $e->getMessage())];
    $httpCode = 500;
} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

enviarResponse($response, $httpCode);