<?php
// api/admin.php
require_once 'utils.php';
require_once '../config/database.php';

ob_start();
ini_set('display_errors', 0);

verificarAuth();

$response = [];
$httpCode = 200;

try {
    $database = new Database();
    $db = $database->getConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $resource = $_GET['resource'] ?? '';
    $action = $_GET['action'] ?? '';

    // Contexto do Usuário Logado
    $currentId = $_SESSION['user_id'];
    $currentRole = $_SESSION['user_funcao'];
    $isAdmin = ($currentRole === 'Admin');

    // --- GET (Leitura) ---
    if ($method === 'GET') {
        if (!$isAdmin) throw new Exception("Acesso restrito a Admins.", 403);

        if ($resource === 'usuarios') {
            $stmt = $db->query("SELECT id, nome, usuario, funcao FROM Usuario ORDER BY nome");
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } elseif ($resource === 'logs') {
            $stmt = $db->query("SELECT DATE_FORMAT(dataHora, '%d/%m/%Y %H:%i') as dataHora, usuario, acao, detalhes FROM Log ORDER BY id DESC LIMIT 100");
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }

    // --- POST (Escrita) ---
    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'));

        // 1. CRIAR USUÁRIO (Apenas Admin)
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

        // 2. EDITAR USUÁRIO (Admin ou Próprio Usuário)
        elseif ($action === 'editar') {
            if (empty($data->id) || empty($data->nome) || empty($data->login)) {
                throw new Exception("Dados obrigatórios faltando.", 400);
            }

            $isSelf = ($data->id == $currentId);

            // Permissão: Deve ser Admin OU o próprio dono da conta
            if (!$isAdmin && !$isSelf) {
                throw new Exception("Sem permissão para editar outros usuários.", 403);
            }

            // Validação de Login Duplicado (exceto para o próprio ID)
            $check = $db->prepare("SELECT id FROM Usuario WHERE usuario = :u AND id != :id");
            $check->execute([':u' => $data->login, ':id' => $data->id]);
            if ($check->rowCount() > 0) throw new Exception("Este login já está em uso.", 409);

            // Regra de Função:
            // Se for Admin, usa a função enviada pelo front.
            // Se NÃO for Admin, força a função atual (impede elevação de privilégio).
            $novaFuncao = $isAdmin ? ($data->funcao ?? 'Operador') : $currentRole;

            $stmt = $db->prepare("UPDATE Usuario SET nome = :n, usuario = :u, funcao = :f WHERE id = :id");
            $stmt->execute([
                ':n' => $data->nome,
                ':u' => $data->login,
                ':f' => $novaFuncao,
                ':id' => $data->id
            ]);

            // Atualiza sessão se editou o próprio nome
            if ($isSelf) {
                $_SESSION['user_nome'] = $data->nome;
                // $_SESSION['user_funcao'] = $novaFuncao; // Se quiser atualizar a role na sessão imediatamente
            }

            registrarLog($db, $_SESSION['user_nome'], "Editar Usuário", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Perfil atualizado com sucesso.'];
        }

        // 3. RESETAR SENHA (Admin ou Próprio Usuário)
        elseif ($action === 'resetSenha') {
            if (empty($data->id) || empty($data->novaSenha)) throw new Exception("Dados incompletos.", 400);

            $isSelf = ($data->id == $currentId);
            if (!$isAdmin && !$isSelf) throw new Exception("Sem permissão.", 403);

            $hash = password_hash($data->novaSenha, PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE Usuario SET senha = :s WHERE id = :id");
            $stmt->execute([':s' => $hash, ':id' => $data->id]);

            registrarLog($db, $_SESSION['user_nome'], "Reset Senha", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Senha alterada.'];
        }

        // 4. EXCLUIR (Apenas Admin)
        elseif ($action === 'excluir') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem excluir.", 403);
            if ($data->id == $currentId) throw new Exception("Não pode excluir a própria conta.", 403);

            $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
            $stmt->execute([':id' => $data->id]);

            registrarLog($db, $_SESSION['user_nome'], "Excluir Usuário", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Usuário removido.'];
        }
    }

    // --- DELETE (Apenas Admin) ---
    elseif ($method === 'DELETE') {
        if (!$isAdmin) throw new Exception("Acesso negado.", 403);
        $id = $_GET['id'] ?? null;
        if (!$id || $id == $currentId) throw new Exception("Operação inválida.", 400);

        $stmt = $db->prepare("DELETE FROM Usuario WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $response = ['success' => true];
    }

} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

enviarResponse($response, $httpCode);