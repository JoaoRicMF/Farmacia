<?php
// Desativa a exibição de erros na tela (vai apenas para o log)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");

// Inicia sessão apenas se não existir
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

include_once '../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// --- LOGOUT ---
if ($action === 'logout') {
    session_destroy();
    echo json_encode(["success" => true]);
    exit;
}

// --- VERIFICAR SESSÃO (CHECK) ---
if ($action === 'check') {
    if (isset($_SESSION['user_id'])) { // Alterado de $_SESSION['id'] para 'user_id'
        echo json_encode([
            "id" => $_SESSION['user_id'],   // Front-end espera "id"
            "nome" => $_SESSION['user_nome'],
            "funcao" => $_SESSION['user_funcao']
        ]);
    } else {
        http_response_code(401);
        echo json_encode(["message" => "Não logado"]);
    }
    exit;
}

// --- LOGIN (POST) ---
if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"));

    if (!isset($data->usuario) || !isset($data->senha)) {
        echo json_encode(["success" => false, "message" => "Dados incompletos"]);
        exit;
    }

    $database = new Database();
    $db = $database->getConnection();

    if (!$db) {
        // Retorna erro JSON válido em vez de texto
        echo json_encode(["success" => false, "message" => "Erro conexão banco"]);
        exit;
    }

    // Busca usuário
    $query = "SELECT id, nome, senha, funcao FROM Usuario WHERE usuario = :usuario LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(":usuario", $data->usuario);
    $stmt->execute();

    if ($stmt->rowCount() > 0) {
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        // Verifica senha (texto puro conforme seu banco atual)
        if ($data->senha === $row['senha']) {
            $_SESSION['user_id'] = $row['id']; // Padronizado para user_id
            $_SESSION['user_nome'] = $row['nome'];
            $_SESSION['user_funcao'] = $row['funcao'];

            echo json_encode([
                "success" => true,
                "id" => $row['id'],           // Garantindo que retorne "id" para o script.js
                "nome" => $row['nome'],
                "funcao" => $row['funcao']
            ]);
        } else {
            echo json_encode(["success" => false, "message" => "Senha incorreta"]);
        }
    } else {
        echo json_encode(["success" => false, "message" => "Usuário não encontrado"]);
    }
    exit;
}
?>