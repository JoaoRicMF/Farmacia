<?php
// api/auth.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) session_start();
include_once '../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Logout
if ($action === 'logout') {
    session_destroy();
    echo json_encode(["success" => true]);
    exit;
}

// Check Sessão
if ($action === 'check') {
    if (isset($_SESSION['user_id'])) {
        echo json_encode([
            "id" => $_SESSION['user_id'],
            "nome" => $_SESSION['user_nome'],
            "funcao" => $_SESSION['user_funcao']
        ]);
    } else {
        http_response_code(401);
        echo json_encode(["message" => "Não logado"]);
    }
    exit;
}

// Login
if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    $db = (new Database())->getConnection();

    if (!$db) {
        echo json_encode(["success" => false, "message" => "Erro conexão DB"]);
        exit;
    }

    $stmt = $db->prepare("SELECT id, nome, senha, funcao FROM Usuario WHERE usuario = :u LIMIT 1");
    $stmt->execute([':u' => $data->usuario ?? '']);

    if ($stmt->rowCount() > 0) {
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        // VERIFICAÇÃO SEGURA (HASH)
        if (password_verify($data->senha, $row['senha'])) {
            $_SESSION['user_id'] = $row['id'];
            $_SESSION['user_nome'] = $row['nome'];
            $_SESSION['user_funcao'] = $row['funcao'];

            // Log de acesso (opcional)
            registrarLog($db, $row['nome'], "Login", "Sucesso via Web");

            echo json_encode([
                "success" => true,
                "id" => $row['id'],
                "nome" => $row['nome'],
                "funcao" => $row['funcao']
            ]);
            exit;
        }
    }

    echo json_encode(["success" => false, "message" => "Usuário ou senha incorretos"]);
    exit;
}
?>