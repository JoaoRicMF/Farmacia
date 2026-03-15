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
    $currentId   = $_SESSION['user_id'];
    $currentRole = $_SESSION['user_funcao'];
    $isAdmin     = ($currentRole === 'Admin');
    $idUnidade   = (int)($_SESSION['id_unidade_ativa'] ?? 0);
    if (!$idUnidade) {
        enviarResponse(['success' => false, 'message' => 'Nenhuma unidade ativa.'], 403);
        exit;
    }

    // --- GET (Leitura) ---
    if ($method === 'GET') {

        if ($resource === 'usuarios') {
            // Filtra usuários com acesso à unidade ativa
            $stmt = $db->prepare(
                "SELECT u.id, u.nome, u.usuario, u.funcao
                 FROM usuario u
                 INNER JOIN usuario_unidade uu ON uu.id_usuario = u.id
                 WHERE uu.id_unidade = :uid
                 ORDER BY u.nome"
            );
            $stmt->execute([':uid' => $idUnidade]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Enriquece cada usuário com suas unidades vinculadas
            $stmtUn = $db->prepare(
                "SELECT un.id, un.nome FROM unidades un
                 INNER JOIN usuario_unidade uu ON uu.id_unidade = un.id
                 WHERE uu.id_usuario = :uid ORDER BY un.nome"
            );
            foreach ($rows as &$u) {
                $stmtUn->execute([':uid' => $u['id']]);
                $u['unidades'] = $stmtUn->fetchAll(PDO::FETCH_ASSOC);
            }
            unset($u);
            $response = $rows;

        } elseif ($resource === 'unidades') {
             if ($isAdmin) {
                $stmt = $db->query("SELECT id, nome FROM unidades ORDER BY nome");
            } else {
                $stmt = $db->prepare(
                    "SELECT u.id, u.nome FROM unidades u
                    INNER JOIN usuario_unidade uu ON uu.id_unidade = u.id
                    WHERE uu.id_usuario = :uid ORDER BY u.nome"
                );
                $stmt->execute([':uid' => $currentId]);
            }
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

    // --- POST (Escrita) ---
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'));

        // 1. CRIAR USUÁRIO (Apenas Admin)
        if ($action === 'criarUsuario') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem criar usuários.", 403);
            if (empty($data->nome) || empty($data->login) || empty($data->password)) {
                throw new Exception("Dados incompletos.", 400);
            }

            // Login único (global)
            $dup = $db->prepare("SELECT COUNT(*) FROM usuario WHERE usuario = :u");
            $dup->execute([':u' => $data->login]);
            if ($dup->fetchColumn() > 0) throw new Exception("Login já está em uso.", 409);

            $senhaHash = password_hash($data->password, PASSWORD_DEFAULT);
            $funcao    = ucfirst($data->nivel ?? 'Operador');

            $db->beginTransaction();
            try {
                $stmt = $db->prepare("INSERT INTO usuario (nome, usuario, senha, funcao) VALUES (:n, :u, :s, :f)");
                $stmt->execute([':n' => $data->nome, ':u' => $data->login, ':s' => $senhaHash, ':f' => $funcao]);
                $novoId = $db->lastInsertId();

                // Vincula às unidades enviadas ou à unidade ativa como padrão
                $unidadesParaVincular = !empty($data->unidades) ? (array)$data->unidades : [$idUnidade];
                $stmtV = $db->prepare("INSERT IGNORE INTO usuario_unidade (id_usuario, id_unidade) VALUES (:u, :un)");
                foreach ($unidadesParaVincular as $idUn) {
                    $stmtV->execute([':u' => $novoId, ':un' => (int)$idUn]);
                }

                $db->commit();
            } catch (Exception $eC) {
                $db->rollBack(); throw $eC;
            }

            registrarLog($db, $_SESSION['user_nome'], "Criar Usuário", "User: $data->login");
            $response = ['success' => true, 'message' => 'Usuário criado com sucesso', 'id' => $novoId];
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

            // Previne edição cross-tenant: Admin só edita membros da sua unidade
            if ($isAdmin && !$isSelf) {
                $chkUn = $db->prepare("SELECT COUNT(*) FROM usuario_unidade WHERE id_usuario=:uid AND id_unidade=:un");
                $chkUn->execute([':uid' => $data->id, ':un' => $idUnidade]);
                if ($chkUn->fetchColumn() == 0) throw new Exception("Usuário não pertence a esta unidade.", 403);
            }

            // Proteção: Admin não pode editar dados nem alterar função de outro Admin
            if ($isAdmin && !$isSelf) {
                $chkAlvoEd = $db->prepare("SELECT funcao FROM usuario WHERE id = :id");
                $chkAlvoEd->execute([':id' => $data->id]);
                $alvoEd = $chkAlvoEd->fetch(PDO::FETCH_ASSOC);
                if ($alvoEd && $alvoEd['funcao'] === 'Admin') {
                    throw new Exception("Não é permitido editar a conta de outro Administrador.", 403);
                }
            }

            // Validação de Login Duplicado (exceto para o próprio ID)
            $check = $db->prepare("SELECT id FROM usuario WHERE usuario = :u AND id != :id");
            $check->execute([':u' => $data->login, ':id' => $data->id]);
            if ($check->rowCount() > 0) throw new Exception("Este login já está em uso.", 409);

            // Regra de Função:
            // Se for Admin, usa a função enviada pelo front — mas não pode promover outros a Admin.
            // Se NÃO for Admin, força a função atual (impede elevação de privilégio).
            $funcaoSolicitada = ucfirst($data->funcao ?? 'Operador');
            if ($isAdmin && !$isSelf && $funcaoSolicitada === 'Admin') {
                throw new Exception("Não é permitido promover outro usuário a Administrador.", 403);
            }
            $novaFuncao = $isAdmin ? $funcaoSolicitada : $currentRole;

            $stmt = $db->prepare("UPDATE usuario SET nome = :n, usuario = :u, funcao = :f WHERE id = :id");
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

            // Se Admin enviou array de unidades, ressincroniza os vínculos.
            // SEGURANÇA: Apenas manipula unidades às quais o Admin logado tem acesso,
            // nunca removendo vínculos de outras instalações/tenants.
            if ($isAdmin && isset($data->unidades) && is_array($data->unidades)) {
                // 1. Obtém todas as unidades às quais o Admin logado tem acesso (seu escopo)
                $stmtAdminUns = $db->prepare(
                    "SELECT id_unidade FROM usuario_unidade WHERE id_usuario = :uid"
                );
                $stmtAdminUns->execute([':uid' => $currentId]);
                $adminScope = array_column($stmtAdminUns->fetchAll(PDO::FETCH_ASSOC), 'id_unidade');

                // 2. Filtra o array recebido para aceitar apenas IDs dentro do escopo do Admin
                $novasUnidades = array_values(array_filter(
                    array_map('intval', $data->unidades),
                    fn($id) => in_array($id, $adminScope)
                ));

                if (empty($novasUnidades)) {
                    throw new Exception("Selecione ao menos uma unidade válida.", 400);
                }

                // 3. Remove APENAS os vínculos dentro do escopo do Admin (preserva outros tenants)
                $placeholders = implode(',', array_fill(0, count($adminScope), '?'));
                $stmtDel = $db->prepare(
                    "DELETE FROM usuario_unidade 
                     WHERE id_usuario = ? AND id_unidade IN ($placeholders)"
                );
                $stmtDel->execute(array_merge([(int)$data->id], $adminScope));

                // 4. Insere os vínculos novos selecionados pelo Admin
                $stmtIns = $db->prepare(
                    "INSERT IGNORE INTO usuario_unidade (id_usuario, id_unidade) VALUES (?, ?)"
                );
                foreach ($novasUnidades as $idUn) {
                    $stmtIns->execute([(int)$data->id, $idUn]);
                }
            }

            registrarLog($db, $_SESSION['user_nome'], "Editar Usuário", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Perfil atualizado com sucesso.'];
        }

        // 3. RESETAR SENHA (Admin ou Próprio Usuário)
        elseif ($action === 'resetSenha') {
            if (empty($data->id) || empty($data->novaSenha)) throw new Exception("Dados incompletos.", 400);

            $isSelf = ($data->id == $currentId);
            if (!$isAdmin && !$isSelf) throw new Exception("Sem permissão.", 403);

            // Proteção: Admin não pode resetar senha de outro Admin (exceto a própria)
            if ($isAdmin && !$isSelf) {
                $chkAlvo = $db->prepare("SELECT funcao FROM usuario WHERE id = :id");
                $chkAlvo->execute([':id' => $data->id]);
                $alvo = $chkAlvo->fetch(PDO::FETCH_ASSOC);
                if ($alvo && $alvo['funcao'] === 'Admin') {
                    throw new Exception("Não é permitido resetar a senha de outro Administrador.", 403);
                }
            }

            $hash = password_hash($data->novaSenha, PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE usuario SET senha = :s WHERE id = :id");
            $stmt->execute([':s' => $hash, ':id' => $data->id]);

            registrarLog($db, $_SESSION['user_nome'], "Reset Senha", "ID: $data->id");
            $response = ['success' => true, 'message' => 'Senha alterada.'];
        }

        // 4. EXCLUIR (Apenas Admin)
        elseif ($action === 'excluir') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem excluir.", 403);
            if ($data->id == $currentId) throw new Exception("Não pode excluir a própria conta.", 403);

            // Cross-tenant guard
            $chkEx = $db->prepare("SELECT COUNT(*) FROM usuario_unidade WHERE id_usuario=:uid AND id_unidade=:un");
            $chkEx->execute([':uid' => $data->id, ':un' => $idUnidade]);
            if ($chkEx->fetchColumn() == 0) throw new Exception("Usuário não pertence a esta unidade.", 403);

            // Remove o vínculo da unidade atual
            $db->prepare("DELETE FROM usuario_unidade WHERE id_usuario=:uid AND id_unidade=:un")
               ->execute([':uid' => $data->id, ':un' => $idUnidade]);

            // Se sem mais vínculos → remove o registro de usuário
            $resto = $db->prepare("SELECT COUNT(*) FROM usuario_unidade WHERE id_usuario=:uid");
            $resto->execute([':uid' => $data->id]);
            if ($resto->fetchColumn() == 0) {
                $db->prepare("DELETE FROM usuario WHERE id=:id")->execute([':id' => $data->id]);
            }

            registrarLog($db, $_SESSION['user_nome'], "Excluir Usuário", "ID: $data->id | Unidade: $idUnidade");
            $response = ['success' => true, 'message' => 'Usuário removido.'];
        }

        // 5. CRIAR UNIDADE (Apenas Admin)
        elseif ($action === 'criarUnidade') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem gerenciar unidades.", 403);
            $nome = trim($data->nome ?? '');
            if (!$nome) throw new Exception("Nome da unidade é obrigatório.", 400);

            $dup = $db->prepare("SELECT COUNT(*) FROM unidades WHERE nome = :n");
            $dup->execute([':n' => $nome]);
            if ($dup->fetchColumn() > 0) throw new Exception("Unidade já cadastrada.", 409);

            $stmt = $db->prepare("INSERT INTO unidades (nome) VALUES (:n)");
            $stmt->execute([':n' => $nome]);
            $novaId = $db->lastInsertId();

            // Vincula automaticamente o admin criador à nova unidade
            $db->prepare("INSERT IGNORE INTO usuario_unidade (id_usuario, id_unidade) VALUES (:u,:un)")
               ->execute([':u' => $currentId, ':un' => $novaId]);

            $stmtUns = $db->prepare(
                "SELECT u.id, u.nome FROM unidades u
                 INNER JOIN usuario_unidade uu ON uu.id_unidade = u.id
                 WHERE uu.id_usuario = :uid ORDER BY u.nome"
            );
            $stmtUns->execute([':uid' => $currentId]);
            $_SESSION['unidades'] = $stmtUns->fetchAll(PDO::FETCH_ASSOC);

            registrarLog($db, $_SESSION['user_nome'], "Criar Unidade", "Nome: $nome | ID: $novaId");
            $response = ['success' => true, 'message' => 'Unidade criada.', 'id' => $novaId];
        }

        // 6. EXCLUIR UNIDADE (Apenas Admin)
        elseif ($action === 'excluirUnidade') {
            if (!$isAdmin) throw new Exception("Apenas Admins podem gerenciar unidades.", 403);
            $idUn = (int)($data->id ?? 0);
            if (!$idUn) throw new Exception("ID inválido.", 400);
            if ($idUn === $idUnidade) throw new Exception("Não é possível excluir a unidade ativa.", 400);

            $db->beginTransaction();
            try {
                // Remove dados vinculados ANTES de remover a unidade
                foreach (['financeiro', 'saidacaixa', 'entradacaixa', 'categorias', 'fornecedor'] as $tabela) {
                    $db->prepare("DELETE FROM $tabela WHERE id_unidade = :un")
                    ->execute([':un' => $idUn]);
                }
                $db->prepare("DELETE FROM usuario_unidade WHERE id_unidade=:un")->execute([':un' => $idUn]);
                $db->prepare("DELETE FROM unidades WHERE id=:un")->execute([':un' => $idUn]);
                $db->commit();
            } catch (Exception $e) {
                $db->rollBack(); throw $e;
            }

            registrarLog($db, $_SESSION['user_nome'], "Excluir Unidade", "ID: $idUn");
            $response = ['success' => true, 'message' => 'Unidade removida.'];
        }
    }

    // --- DELETE (Apenas Admin) ---
    elseif ($method === 'DELETE') {
        if (!$isAdmin) throw new Exception("Acesso negado.", 403);
        $id = $_GET['id'] ?? null;
        if (!$id || $id == $currentId) throw new Exception("Operação inválida.", 400);

        $chkD = $db->prepare("SELECT COUNT(*) FROM usuario_unidade WHERE id_usuario=:uid AND id_unidade=:un");
        $chkD->execute([':uid' => $id, ':un' => $idUnidade]);
        if ($chkD->fetchColumn() == 0) throw new Exception("Usuário não pertence a esta unidade.", 403);

        $db->prepare("DELETE FROM usuario_unidade WHERE id_usuario=:uid AND id_unidade=:un")
           ->execute([':uid' => $id, ':un' => $idUnidade]);

        $restoD = $db->prepare("SELECT COUNT(*) FROM usuario_unidade WHERE id_usuario=:uid");
        $restoD->execute([':uid' => $id]);
        if ($restoD->fetchColumn() == 0) {
            $db->prepare("DELETE FROM usuario WHERE id=:id")->execute([':id' => $id]);
        }

        $response = ['success' => true];
    }

} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

enviarResponse($response, $httpCode);