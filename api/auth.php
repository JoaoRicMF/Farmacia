<?php
// api/auth.php
header("Content-Type: application/json");
session_start();

include_once '../config/database.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Erro de conexão com o Banco de Dados"]);
    exit;
}

// Lê o corpo da requisição JSON
$data = json_decode(file_get_contents("php://input"));
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'POST' && $action === 'login') {
    $usuario = $data->usuario;
    $senha = $data->senha; // Nota: No Java estava em texto puro (NoOpPasswordEncoder)

    $query = "SELECT * FROM Usuario WHERE usuario = :usuario LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(":usuario", $usuario);
    $stmt->execute();

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Verifica senha (idealmente use password_verify, mas mantive a lógica do Java)
    if ($user && $user['senha'] === $senha) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_nome'] = $user['nome'];
        $_SESSION['user_funcao'] = $user['funcao'];

        echo json_encode([
            "success" => true,
            "nome" => $user['nome'],
            "funcao" => $user['funcao']
        ]);
    } else {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Credenciais inválidas"]);
    }
    exit;
}

if ($method === 'POST' && $action === 'logout') {
    session_destroy();
    echo json_encode(["success" => true]);
    exit;
}

if ($method === 'GET' && $action === 'check') {
    if (isset($_SESSION['user_id'])) {
        echo json_encode([
            "login" => $_SESSION['user_nome'], // O frontend espera 'login' como nome de exibição
            "nome" => $_SESSION['user_nome']
        ]);
    } else {
        http_response_code(401);
        echo json_encode([]);
    }
    exit;
}
?>