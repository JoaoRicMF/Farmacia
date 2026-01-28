<?php
// api/admin.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);

// Validação de sessão (Login obrigatório)
verificarAuth();

$response = [];
$httpCode = 200;

try {
    $database = new Database();
    $db = $database->getConnection();

    $method = $_SERVER['REQUEST_METHOD'];
    $resource = $_GET['resource'] ?? '';
    $action = $_GET['action'] ?? '';

    // Dados da Sessão Atual
    $currentUserId = $_SESSION['user_id'];
    $currentUserFuncao = $_SESSION['user_funcao'] ?? 'Operador';
    $isAdmin = ($currentUserFuncao === 'Admin');

    // --- REGRAS DE LEITURA (GET) ---
    // Apenas Admins podem listar todos os usuários ou ver logs
    if ($method === 'GET') {
        if (!$isAdmin) {
            throw new Exception("Acesso restrito a Administradores.", 403);
        }

        if ($resource === 'usuarios') {
            $stmt = $db->query("SELECT id, nome, usuario, funcao FROM Usuario ORDER BY nome");
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        elseif ($resource === 'logs') {
            $stmt = $db->query("SELECT DATE_FORMAT(dataHora, '%d/%m/%Y %H:%i') as dataHora, usuario, acao, detalhes FROM Log ORDER BY id DESC LIMIT 100");
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }

    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'));

        // --- CRIAR USUÁRIO (Restrito a Admin) ---
        if ($action === 'criarUsuario') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem criar usuários.", 403);

            if (empty($data->nome) || empty($data->login) || empty($data->password)) {
                throw new Exception("Dados incompletos.", 400);
            }

            $senhaHash = password_hash($data->password, PASSWORD_DEFAULT);
            $funcao = ucfirst($data->nivel ?? 'Operador');

            $stmt = $db->prepare("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES (:n, :u, :s, :f)");
            $stmt->execute([':n' => $data->nome, ':u' => $data->login, ':s' => $senhaHash, ':f' => $funcao]);

            registrarLog($db, $_SESSION['user_nome'], "Criar Usuário", "User: $data->login");
            $response = ['success' => true, 'message' => 'Usuário criado com sucesso'];
        }

        // --- EDITAR USUÁRIO (Admin ou Próprio Usuário) ---
        elseif ($action === 'editar') {
            if (empty($data->id) || empty($data->nome) || empty($data->login)) {
                throw new Exception("Dados obrigatórios faltando.", 400);
            }

            // Verifica se é o próprio usuário
            $isProprioUsuario = ($data->id == $currentUserId);

            // Se não for Admin E não for o próprio usuário, bloqueia
            if (!$isAdmin && !$isProprioUsuario) {
                throw new Exception("Você não tem permissão para editar outros usuários.", 403);
            }

            // Validação de login duplicado
            $check = $db->prepare("SELECT id FROM Usuario WHERE usuario = :u AND id != :id");
            $check->execute([':u' => $data->login, ':id' => $data->id]);
            if ($check->rowCount() > 0) throw new Exception("Este login já está em uso.", 409);

            // Define a função: Se for Admin, usa o enviado. Se for Operador, força 'Operador' (evita elevação de privilégio)
            $novaFuncao = $isAdmin ? ($data->funcao ?? 'Operador') : 'Operador';

            $stmt = $db->prepare("UPDATE Usuario SET nome = :n, usuario = :u, funcao = :f WHERE id = :id");
            $stmt->execute([
                ':n' => $data->nome,
                ':u' => $data->login,
                ':f' => $novaFuncao,
                ':id' => $data->id
            ]);

            // Se o usuário editou o próprio perfil, atualizamos a sessão
            if ($isProprioUsuario) {
                $_SESSION['user_nome'] = $data->nome;
            }

            registrarLog($db, $_SESSION['user_nome'], "Editar Usuário", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Usuário atualizado.'];
        }

        // --- RESETAR SENHA (Admin ou Próprio Usuário) ---
        elseif ($action === 'resetSenha') {
            if (empty($data->id) || empty($data->novaSenha)) {
                throw new Exception("ID e Nova Senha são obrigatórios.", 400);
            }

            $isProprioUsuario = ($data->id == $currentUserId);

            // Bloqueia se não for Admin tentando mudar senha de outrem
            if (!$isAdmin && !$isProprioUsuario) {
                throw new Exception("Apenas Admins podem resetar senhas de terceiros.", 403);
            }

            $hash = password_hash($data->novaSenha, PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE Usuario SET senha = :s WHERE id = :id");
            $stmt->execute([':s' => $hash, ':id' => $data->id]);

            registrarLog($db, $_SESSION['user_nome'], "Reset Senha", "Resetou senha do ID: $data->id");
            $response = ['success' => true, 'message' => 'Senha alterada com sucesso.'];
        }

        // --- EXCLUIR USUÁRIO (Restrito a Admin) ---
        elseif ($action === 'excluir') {
            if (!$isAdmin) throw new Exception("Acesso restrito a Admins.", 403);
            if (empty($data->id)) throw new Exception("ID não fornecido.", 400);

            if ($data->id == $currentUserId) {
                throw new Exception("Você não pode excluir sua própria conta.", 403);
            }

            $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
            $stmt->execute([':id' => $data->id]);

            registrarLog($db, $_SESSION['user_nome'], "Excluir Usuário", "ID Excluído: $data->id");
            $response = ['success' => true, 'message' => 'Usuário removido.'];
        }

        else {
            throw new Exception("Ação desconhecida.", 404);
        }
    }

    // --- DELETE VIA VERBO HTTP (Restrito a Admin) ---
    elseif ($method === 'DELETE') {
        if (!$isAdmin) throw new Exception("Acesso restrito a Admins.", 403);

        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception("ID inválido", 400);
        if ($id == $currentUserId) throw new Exception("Auto-exclusão proibida", 403);

        $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
        $stmt->execute([':id' => $id]);
        registrarLog($db, $_SESSION['user_nome'], "Excluir Usuário", "ID: $id");
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