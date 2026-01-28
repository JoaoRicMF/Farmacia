<?php
// api/financeiro.php
ob_start();

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json; charset=UTF-8");

$response = ['success' => false, 'message' => 'Erro interno'];
$httpCode = 200;

try {
    if (session_status() === PHP_SESSION_NONE) session_start();

    if (!isset($_SESSION['user_id'])) {
        throw new Exception("Sessão expirada", 401);
    }

    require_once '../config/database.php';
    $dbClass = new Database();
    $db = $dbClass->getConnection();
    $userNome = $_SESSION['user_nome'];

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    $id = $_GET['id'] ?? null;

    // --- LISTAGEM (GET) ---
    if ($method === 'GET') {
        // ... (Sua lógica de GET existente) ...
        // Vou resumir para o exemplo:
        $busca = $_GET['busca'] ?? '';
        $sql = "SELECT * FROM Financeiro WHERE descricao LIKE :b OR codigo_barras LIKE :b ORDER BY vencimento LIMIT 50";
        $stmt = $db->prepare($sql);
        $stmt->execute([':b' => "%$busca%"]);
        $dados = $stmt->fetchAll();

        $response = ['success' => true, 'registros' => $dados];
    }

    // --- SALVAR / EDITAR (POST) ---
    // Aceita POST puro ou POST com ?action=salvar
    elseif ($method === 'POST' && ($action === 'salvar' || empty($action) || $action === 'editar')) {
        $input = json_decode(file_get_contents("php://input"));

        if (!$input) throw new Exception("JSON de entrada inválido");

        // Validação mínima
        if (empty($input->descricao) || empty($input->valor)) {
            throw new Exception("Dados obrigatórios faltando");
        }

        if (!empty($input->id)) {
            // UPDATE
            $sql = "UPDATE Financeiro SET descricao=:d, valor=:v, vencimento=:ve, categoria=:c, status=:s, codigo_barras=:cb WHERE id=:id";
            $stmt = $db->prepare($sql);
            $stmt->bindValue(':id', $input->id);
            $logAction = "Editar Financeiro";
        } else {
            // INSERT
            $sql = "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, status, codigo_barras) VALUES (:d, :v, :ve, :c, :s, :cb)";
            $stmt = $db->prepare($sql);
            $logAction = "Novo Financeiro";
        }

        $stmt->bindValue(':d', $input->descricao);
        $stmt->bindValue(':v', $input->valor);
        $stmt->bindValue(':ve', $input->vencimento);
        $stmt->bindValue(':c', $input->categoria);
        $stmt->bindValue(':s', $input->status ?? 'Pendente');
        $stmt->bindValue(':cb', $input->codigo_barras ?? '');

        $stmt->execute();
        registrarLog($db, $userNome, $logAction, "R$ $input->valor - $input->descricao");

        $response = ['success' => true, 'message' => 'Registro salvo com sucesso'];
    }

    // --- EXCLUIR (DELETE ou POST action=excluir) ---
    elseif (($method === 'DELETE') || ($method === 'POST' && $action === 'excluir')) {
        $idDel = $id ?? json_decode(file_get_contents("php://input"))->id ?? null;

        if (!$idDel) throw new Exception("ID não fornecido");

        $stmt = $db->prepare("DELETE FROM Financeiro WHERE id = :id");
        $stmt->execute([':id' => $idDel]);
        registrarLog($db, $userNome, "Excluir Financeiro", "ID: $idDel");

        $response = ['success' => true];
    }

} catch (Exception $e) {
    // Se for erro de sessão, retorna 401, senão 500
    $httpCode = ($e->getCode() === 401) ? 401 : 500;
    $response = ['success' => false, 'message' => $e->getMessage()];
    error_log("Financeiro API Error: " . $e->getMessage());
}

ob_clean(); // LIMPEZA BLINDADA
http_response_code($httpCode);
echo json_encode($response);
exit;