<?php
// api/auth.php
ob_start(); // Inicia o buffer para capturar qualquer output indesejado

// Configurações de Erro (Logar, não exibir)
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$response = ['success' => false, 'message' => 'Erro desconhecido'];
$httpCode = 200;

try {
    // Garante o caminho correto para a configuração
    require_once __DIR__ . '/../config/database.php';

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // --- LOGOUT ---
    if ($action === 'logout') {
        session_destroy();
        $response = ["success" => true, "message" => "Logout realizado"];
    } // --- CHECK SESSÃO ---
    elseif ($action === 'check') {
        if (isset($_SESSION['user_id'])) {
            $response = [
                "success" => true,
                "id" => $_SESSION['user_id'],
                "nome" => $_SESSION['user_nome'],
                "funcao" => $_SESSION['user_funcao']
            ];
        } else {
            // Retorne success false para o JS saber que deve mostrar a tela de login
            $response = ["success" => false, "message" => "Nenhuma sessão ativa"];
            $httpCode = 200;
        }
    }
    // --- LOGIN ---
    elseif ($method === 'POST') {
        $input = json_decode(file_get_contents("php://input"));

        $dbClass = new Database();
        $db = $dbClass->getConnection();

        $stmt = $db->prepare("SELECT id, nome, senha, funcao FROM Usuario WHERE usuario = :u LIMIT 1");
        $stmt->execute([':u' => $input->usuario ?? '']);

        if ($stmt->rowCount() > 0) {
            $row = $stmt->fetch();
            if (password_verify($input->senha ?? '', $row['senha'])) {
                $_SESSION['user_id'] = $row['id'];
                $_SESSION['user_nome'] = $row['nome'];
                $_SESSION['user_funcao'] = $row['funcao'];

                registrarLog($db, $row['nome'], "Login", "Sucesso via Web");

                $response = [
                    "success" => true,
                    "id" => $row['id'],
                    "nome" => $row['nome'],
                    "funcao" => $row['funcao']
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
    http_response_code(500); // Internal Server Error
    $response = ["success" => false, "message" => "Erro Interno: " . $e->getMessage()];
}

// LIMPEZA FINAL E RESPOSTA
ob_clean(); // Descarta warnings ou espaços em branco anteriores
http_response_code($httpCode);
echo json_encode($response);
exit;