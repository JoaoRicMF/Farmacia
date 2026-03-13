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
        $input = json_decode(file_get_contents("php://input"));
        $novaUnidade = (int)($input->id_unidade ?? 0);

        // Verifica se o usuário realmente tem acesso a essa unidade
        $unidadesPermitidas = array_column($_SESSION['unidades'] ?? [], 'id');

        if (!in_array($novaUnidade, $unidadesPermitidas)) {
            http_response_code(403);
            $response = ["success" => false, "message" => "Acesso negado a esta unidade."];
        } else {
            $_SESSION['id_unidade_ativa'] = $novaUnidade;
            $nomeUnidade = '';
            foreach ($_SESSION['unidades'] as $u) {
                if ((int)$u['id'] === $novaUnidade) { $nomeUnidade = $u['nome']; break; }
            }
            $response = ["success" => true, "unidade_ativa" => ["id" => $novaUnidade, "nome" => $nomeUnidade]];
        }
    }
    // --- LOGOUT ---
    elseif ($action === 'logout') {
        session_destroy();
        $response = ["success" => true, "message" => "Logout realizado"];
    } 
    // --- CHECK SESSÃO ---
    elseif ($action === 'check') {
        if (isset($_SESSION['user_id'])) {
            $response = [
                "success" => true,
                "id" => $_SESSION['user_id'],
                "nome" => $_SESSION['user_nome'],
                "usuario" => $_SESSION['user_login'] ?? '',
                "funcao" => $_SESSION['user_funcao']
            ];
        } else {
            $response = ["success" => false, "message" => "Nenhuma sessão ativa"];
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
                                            WHERE uu.id_usuario = :uid");
                $stmtUnidades->execute([':uid' => $row['id']]);
                $unidades = $stmtUnidades->fetchAll(PDO::FETCH_ASSOC);

                if (count($unidades) === 0) {
                    enviarResponse(["success" => false, "message" => "Usuário não possui acesso a nenhuma unidade."], 403);
                }

                $_SESSION['user_id'] = $row['id'];
                $_SESSION['user_nome'] = $row['nome'];
                $_SESSION['user_login'] = $row['usuario'];
                $_SESSION['user_funcao'] = $row['funcao'];
                $_SESSION['unidades'] = $unidades;
                $_SESSION['id_unidade_ativa'] = $unidades[0]['id']; // Define a primeira como padrão

                $response = [
                    "success" => true,
                    "id" => $row['id'],
                    "nome" => $row['nome'],
                    "funcao" => $row['funcao'],
                    "unidades" => $unidades,
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