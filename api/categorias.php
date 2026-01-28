<?php
// api/categorias.php
ob_start(); // Previne que espaços ou warnings sujem o JSON

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json; charset=UTF-8");

$response = [];
$httpCode = 200;

try {
    if (session_status() === PHP_SESSION_NONE) session_start();

    // Tratamento Amigável de Sessão
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Sessão expirada. Faça login novamente."]);
        ob_end_flush();
        exit;
    }

    require_once '../config/database.php';
    $database = new Database();
    $db = $database->getConnection();

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        try {
            $query = "SELECT * FROM Categorias ORDER BY nome";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $response = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (PDOException $e) {
            // Se a tabela não existir ou a query falhar, retorna JSON em vez de Erro 500
            throw new Exception("Erro ao acessar categorias: " . $e->getMessage(), 500);
        }
    }
    // ... (restante da lógica de POST/DELETE se houver)

} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    $response = ["success" => false, "message" => $e->getMessage()];
}

ob_clean(); // Limpa qualquer lixo de saída antes do envio
http_response_code($httpCode);
echo json_encode($response);
exit;