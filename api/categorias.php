<?php
// api/categorias.php
ob_start(); // 1. INICIA BUFFER

// 2. CONFIGURAÇÃO DE ERROS (Logs sim, Tela não)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json; charset=UTF-8");

$response = [];
$httpCode = 200;

try {
    // 3. VERIFICAÇÃO DE SESSÃO
    if (session_status() === PHP_SESSION_NONE) session_start();

    if (!isset($_SESSION['user_id'])) {
        $httpCode = 401;
        throw new Exception("Não autorizado");
    }

    // 4. CONEXÃO
    require_once '../config/database.php';
    $database = new Database();
    $db = $database->getConnection();

    // 5. LÓGICA DE NEGÓCIO
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // Busca categorias padrão e personalizadas
        $query = "SELECT * FROM Categorias ORDER BY nome";
        $stmt = $db->prepare($query);
        $stmt->execute();

        $response = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Se estiver vazio, retorna array vazio [] em vez de erro
        if (!$response) $response = [];
    }
    elseif ($method === 'POST') {
        // Caso implemente criação de categorias via API
        $data = json_decode(file_get_contents("php://input"));
        if (!empty($data->nome)) {
            $stmt = $db->prepare("INSERT INTO Categorias (nome, cor) VALUES (:n, :c)");
            $stmt->execute([':n' => $data->nome, ':c' => $data->cor ?? '#3b82f6']);
            $response = ['success' => true, 'id' => $db->lastInsertId()];
        } else {
            throw new Exception("Nome da categoria obrigatório");
        }
    }

} catch (Exception $e) {
    $httpCode = ($e->getCode() == 401) ? 401 : 500;
    $response = ['error' => $e->getMessage()];
    error_log("Erro API Categorias: " . $e->getMessage());
}

// 6. LIMPEZA FINAL (ESSENCIAL)
ob_clean(); // Limpa qualquer warning ou espaço em branco anterior
http_response_code($httpCode);
echo json_encode($response);
exit;