<?php
// api/admin.php
ob_start(); // Previne que caracteres extras sujem o JSON de saída

error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$response = [];
$httpCode = 200;

try {
    // 1. Verificação de Sessão e Nível de Acesso (Tratamento 403 amigável)
    if (!isset($_SESSION['user_id']) || ($_SESSION['user_funcao'] ?? '') !== 'Admin') {
        http_response_code(403);
        echo json_encode([
            "success" => false,
            "message" => "Acesso negado. Esta área requer privilégios de Administrador."
        ]);
        ob_end_flush();
        exit;
    }

    $database = new Database();
    $db = $database->getConnection();

    $method = $_SERVER['REQUEST_METHOD'];
    $resource = $_GET['resource'] ?? '';
    $action = $_GET['action'] ?? '';

    // --- LISTAR USUÁRIOS ---
    if ($method === 'GET' && $resource === 'usuarios') {
        $stmt = $db->query("SELECT id, nome, usuario, funcao FROM Usuario");
        $response = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // --- CRIAR USUÁRIO ---
    elseif ($method === 'POST' && $action === 'criarUsuario') {
        $data = json_decode(file_get_contents('php://input'));

        if (!empty($data->nome) && !empty($data->login) && !empty($data->password)) {
            // HASHING DA SENHA
            $senhaHash = password_hash($data->password, PASSWORD_DEFAULT);
            $funcao = ucfirst($data->nivel ?? 'Operador');

            $stmt = $db->prepare("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES (:n, :u, :s, :f)");
            $stmt->execute([
                ':n' => $data->nome,
                ':u' => $data->login,
                ':s' => $senhaHash,
                ':f' => $funcao
            ]);

            if (function_exists('registrarLog')) {
                registrarLog($db, $_SESSION['user_nome'] ?? 'Admin', "Criar Usuário", "Criou user: $data->login");
            }

            $response = ['success' => true, 'message' => 'Usuário criado com sucesso'];
        } else {
            throw new Exception("Dados incompletos para criação de usuário", 400);
        }
    } else {
        throw new Exception("Recurso ou ação não encontrada", 404);
    }

} catch (PDOException $e) {
    // Erros de banco de dados (ex: duplicidade de login)
    $httpCode = 500;
    $response = [
        "success" => false,
        "message" => "Erro no banco de dados: " . (str_contains($e->getMessage(), 'Duplicate entry') ? "Este login já existe." : "Falha na operação.")
    ];
} catch (Exception $e) {
    // Outros erros controlados
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

// Limpeza e entrega da resposta
ob_clean();
http_response_code($httpCode);
echo json_encode($response);
exit;