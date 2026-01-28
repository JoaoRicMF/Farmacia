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

    if (!empty($data->nome) && !empty($data->login) && !empty($data->password)) {
        try {
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

            registrarLog($db, $_SESSION['user_nome'], "Criar Usuário", "Criou user: {$data->login}");
            echo json_encode(['success' => true]);

        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Erro (possível duplicidade): ' . $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Dados incompletos']);
    }
    exit;
}