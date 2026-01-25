<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");

// 1. Importa a classe Database
require_once __DIR__ . '/../config/database.php';
session_start();

// Verifica se está logado
if (!isset($_SESSION['user_id']) || $_SESSION['user_funcao'] !== 'Admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Acesso negado']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

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

// 2. Resolve o erro do IDE: Instancia a conexão explicitamente
$database = new Database();
$db = $database->getConnection();

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'criarUsuario') {
    $data = json_decode(file_get_contents('php://input'));

    if (!empty($data->nome) && !empty($data->login) && !empty($data->password)) {
        try {
            // 3. Usa o nome da tabela que está no seu database.php: 'Usuario'
            $query = "INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES (:nome, :usuario, :senha, :funcao)";
            $stmt = $db->prepare($query);

            // Hash da senha para segurança
            $passwordHash = password_hash($data->password, PASSWORD_DEFAULT);
            $nivel = $data->nivel ?? 'operador';

            $stmt->bindParam(':nome', $data->nome);
            $stmt->bindParam(':login', $data->login);
            $stmt->bindParam(':senha', $passwordHash);
            $stmt->bindParam(':nivel', $nivel);

            if ($stmt->execute()) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Erro ao inserir no banco']);
            }
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Dados incompletos']);
    }
    exit;
}