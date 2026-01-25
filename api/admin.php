<?php
// api/admin.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/database.php';
session_start();

// CORREÇÃO: Verifica a sessão correta (user_id e user_funcao)
if (!isset($_SESSION['user_id']) || ($_SESSION['user_funcao'] ?? '') !== 'Admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Acesso negado. Apenas Admin.']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

// --- LISTAR USUÁRIOS ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['resource']) && $_GET['resource'] === 'usuarios') {
        try {
            $stmt = $db->query("SELECT id, nome, usuario, funcao FROM Usuario");
            $usuarios = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($usuarios);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Erro ao listar usuários: ' . $e->getMessage()]);
        }
        exit;
    }
}

// --- CRIAR USUÁRIO ---
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'criarUsuario') {
    $data = json_decode(file_get_contents('php://input'));

    // Verifica se os dados obrigatórios vieram do front (login e password)
    if (!empty($data->nome) && !empty($data->login) && !empty($data->password)) {
        try {
            $query = "INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES (:nome, :usuario, :senha, :funcao)";
            $stmt = $db->prepare($query);

            // CORREÇÃO: Senha em texto puro (conforme seu padrão atual)
            // Se quiser usar hash, altere para: password_hash($data->password, PASSWORD_DEFAULT);
            // Mas lembre-se de atualizar o auth.php para usar password_verify() se fizer isso.
            $senhaParaSalvar = $data->password;

            // Mapeia 'nivel' (do front) para 'funcao' (do banco)
            // Se o front envia 'operador' (minúsculo), convertemos para 'Operador' (enum do banco)
            $funcao = ucfirst($data->nivel ?? 'Operador');

            // CORREÇÃO: Bind correto dos parâmetros (:usuario e :funcao)
            $stmt->bindParam(':nome', $data->nome);
            $stmt->bindParam(':usuario', $data->login); // O front manda 'login', o banco espera ':usuario'
            $stmt->bindParam(':senha', $senhaParaSalvar);
            $stmt->bindParam(':funcao', $funcao);       // O front manda 'nivel', o banco espera ':funcao'

            if ($stmt->execute()) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Erro ao inserir no banco']);
            }
        } catch (PDOException $e) {
            // Tratamento específico para duplicidade de usuário
            if ($e->getCode() == 23000) {
                echo json_encode(['success' => false, 'error' => 'Este usuário já existe.']);
            } else {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Dados incompletos']);
    }
    exit;
}
?>