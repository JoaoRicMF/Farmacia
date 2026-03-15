<?php
// api/auth.php
ob_start();

// Configurações de Erro
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$response = ['success' => false, 'message' => 'Erro desconhecido'];
$httpCode = 200;

try {
    require_once __DIR__ . '/../config/database.php';

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // --- TROCAR UNIDADE ATIVA ---
    if ($action === 'trocar_unidade' && $method === 'POST') {
        if (!isset($_SESSION['user_id'])) {
            http_response_code(401);
            $response = ["success" => false, "message" => "Sessão inválida."];
        } else {
            $input = json_decode(file_get_contents("php://input"));
            $novaUnidade = (int)($input->id_unidade ?? 0);

            // Valida no banco de dados (fonte de verdade), não apenas na sessão
            $dbClass = new Database();
            $db = $dbClass->getConnection();
            $stmtCheck = $db->prepare(
                "SELECT u.id, u.nome FROM unidades u
                 INNER JOIN usuario_unidade uu ON uu.id_unidade = u.id
                 WHERE uu.id_usuario = :uid AND u.id = :un LIMIT 1"
            );
            $stmtCheck->execute([':uid' => $_SESSION['user_id'], ':un' => $novaUnidade]);
            $unidade = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$unidade) {
                http_response_code(403);
                $response = ["success" => false, "message" => "Acesso negado a esta unidade."];
            } else {
                $_SESSION['id_unidade_ativa'] = (int)$unidade['id'];
                // Actualiza o cache de unidades na sessão para ficar consistente
                $stmtUns = $db->prepare(
                    "SELECT u.id, u.nome FROM unidades u
                     INNER JOIN usuario_unidade uu ON uu.id_unidade = u.id
                     WHERE uu.id_usuario = :uid ORDER BY u.nome"
                );
                $stmtUns->execute([':uid' => $_SESSION['user_id']]);
                $_SESSION['unidades'] = $stmtUns->fetchAll(PDO::FETCH_ASSOC);

                $response = [
                    "success" => true,
                    "unidade_ativa" => ["id" => (int)$unidade['id'], "nome" => $unidade['nome']]
                ];
            }
        }
    }
    // --- LOGOUT ---
    elseif ($action === 'logout') {
        session_destroy();
        $response = ["success" => true, "message" => "Logout realizado"];
    } 
    // --- CHECK SESSÃO ---
    elseif ($action === 'check') {
        if (isset($_SESSION['user_id']) && isset($_SESSION['id_unidade_ativa'])) {

            // Normaliza todas as unidades da sessão para garantir que 'id' é sempre int
            // (PDO pode devolver strings dependendo do driver/configuração)
            $unidadesSessao = array_map(function($u) {
                return ['id' => (int)$u['id'], 'nome' => $u['nome']];
            }, $_SESSION['unidades'] ?? []);

            // Procura a unidade ativa com comparação segura (ambos os lados como int)
            $unidadeAtivaData = null;
            $idAtivaInt = (int)$_SESSION['id_unidade_ativa'];
            foreach ($unidadesSessao as $u) {
                if ($u['id'] === $idAtivaInt) {
                    $unidadeAtivaData = $u;
                    break;
                }
            }

            $response = [
                "success"       => true,
                "id"            => (int)$_SESSION['user_id'],
                "nome"          => $_SESSION['user_nome'],
                "usuario"       => $_SESSION['user_login'] ?? '',
                "funcao"        => $_SESSION['user_funcao'],
                "unidades"      => $unidadesSessao,
                "unidade_ativa" => $unidadeAtivaData
            ];
        } else {
            // Se a sessão for antiga/incompleta, nós a destruímos
            session_destroy();
            $response = ["success" => false, "message" => "Nenhuma sessão ativa válida"];
        }
    }
    // --- LOGIN ---
    elseif ($method === 'POST') {
        $input = json_decode(file_get_contents("php://input"));

        $dbClass = new Database();
        $db = $dbClass->getConnection();

        $stmt = $db->prepare("SELECT id, nome, usuario, senha, funcao FROM usuario WHERE usuario = :u LIMIT 1");
        $stmt->execute([':u' => $input->usuario ?? '']);

        if ($stmt->rowCount() > 0) {
    $row = $stmt->fetch();
            if (password_verify($input->senha ?? '', $row['senha'])) {
                // Busca unidades do usuário
                $stmtUnidades = $db->prepare("SELECT u.id, u.nome FROM unidades u 
                                            INNER JOIN usuario_unidade uu ON u.id = uu.id_unidade 
                                            WHERE uu.id_usuario = :uid ORDER BY u.nome");
                $stmtUnidades->execute([':uid' => $row['id']]);
                $unidadesRaw = $stmtUnidades->fetchAll(PDO::FETCH_ASSOC);

                // Normaliza os IDs para int (PDO pode devolver strings)
                $unidades = array_map(fn($u) => ['id' => (int)$u['id'], 'nome' => $u['nome']], $unidadesRaw);

                if (count($unidades) === 0) {
                    enviarResponse(["success" => false, "message" => "Usuário não possui acesso a nenhuma unidade."], 403);
                }

                $_SESSION['user_id']          = (int)$row['id'];
                $_SESSION['user_nome']         = $row['nome'];
                $_SESSION['user_login']        = $row['usuario'];
                $_SESSION['user_funcao']       = $row['funcao'];
                $_SESSION['unidades']          = $unidades;
                $_SESSION['id_unidade_ativa']  = $unidades[0]['id']; // já é int

                $response = [
                    "success"       => true,
                    "id"            => (int)$row['id'],
                    "nome"          => $row['nome'],
                    "funcao"        => $row['funcao'],
                    "unidades"      => $unidades,
                    "unidade_ativa" => $unidades[0]
                ];
            } else {
                $response = ["success" => false, "message" => "Senha incorreta"];
            }
        } else {
            $response = ["success" => false, "message" => "Usuário não encontrado"];
        }
    } else {
        $response = ["success" => false, "message" => "Ação inválida"];
    }

} catch (Exception $e) {
    http_response_code(500);
    $response = ["success" => false, "message" => "Erro Interno: " . $e->getMessage()];
}

ob_clean();
http_response_code($httpCode);
echo json_encode($response);
exit;