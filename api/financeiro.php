<?php
// api/financeiro.php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

session_start();
require_once '../config/database.php';

// Verifica sessão (Segurança básica)
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ''; // Captura a ação da URL

// --- AÇÃO: SALVAR (CRIAR NOVO BOLETO) ---
if ($method === 'POST' && $action === 'salvar') {
    $data = json_decode(file_get_contents("php://input"));

    if (empty($data->descricao) || empty($data->valor) || empty($data->vencimento)) {
        echo json_encode(['success' => false, 'message' => 'Dados incompletos']);
        exit;
    }

    try {
        // Insere na tabela Financeiro
        // Nota: Status padrão é 'Pendente' (definido no banco)
        $query = "INSERT INTO Financeiro (descricao, valor, vencimento, categoria, codigo_barras, status) 
                  VALUES (:descricao, :valor, :vencimento, :categoria, :codigo, 'Pendente')";

        $stmt = $db->prepare($query);

        $stmt->bindParam(':descricao', $data->descricao);
        $stmt->bindParam(':valor', $data->valor);
        $stmt->bindParam(':vencimento', $data->vencimento);
        $stmt->bindParam(':categoria', $data->categoria);     // Espera String (ex: "Água")
        $stmt->bindParam(':codigo', $data->codigo_barras);

        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erro ao inserir no banco']);
        }
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Erro SQL: ' . $e->getMessage()]);
    }
    exit;
}

// --- AÇÃO: LISTAR (PARA O DASHBOARD) ---
if ($method === 'GET') {
    $status = $_GET['status'] ?? null; // Opcional: filtrar por 'Pendente' ou 'Pago'

    try {
        $sql = "SELECT * FROM Financeiro";
        if ($status) {
            $sql .= " WHERE status = :status";
        }
        $sql .= " ORDER BY vencimento ASC";

        $stmt = $db->prepare($sql);
        if ($status) {
            $stmt->bindParam(':status', $status);
        }
        $stmt->execute();

        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Formatar valores para o front
        foreach ($result as &$row) {
            $row['valor_fmt'] = "R$ " . number_format((float)$row['valor'], 2, ',', '.');
            $row['vencimento_fmt'] = date('d/m/Y', strtotime($row['vencimento']));
        }

        echo json_encode($result);

    } catch (PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// --- AÇÃO: PAGAR (DAR BAIXA) ---
if ($method === 'POST' && $action === 'pagar') {
    $data = json_decode(file_get_contents("php://input"));

    if (empty($data->id)) {
        echo json_encode(['success' => false, 'message' => 'ID não informado']);
        exit;
    }

    try {
        $query = "UPDATE Financeiro SET status = 'Pago', data_processamento = NOW() WHERE id = :id";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':id', $data->id);

        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erro ao atualizar']);
        }
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => 'Erro SQL: ' . $e->getMessage()]);
    }
    exit;
}
?>