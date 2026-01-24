<?php
// api/admin.php
header('Content-Type: application/json');

// 1. Importa a classe Database
require_once __DIR__ . '/../config/database.php';
session_start();

// Verifica se está logado
if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'Acesso negado']);
    exit;
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