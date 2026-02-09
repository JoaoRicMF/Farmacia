<?php
// api/financeiro.php
require_once 'utils.php'; // Padronização de respostas e autenticação
require_once '../config/database.php';

// Inicia Buffer e Configura Erros
ob_start();
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Valida sessão (retorna 401 se inválido)
verificarAuth();

$response = ['success' => false, 'message' => 'Erro interno'];
$httpCode = 200;

try {
    $dbClass = new Database();
    $db = $dbClass->getConnection();
    $userNome = $_SESSION['user_nome'];

    // --- ROTINA DE AUTO-UPDATE (VENCIDOS) ---
    // Executa antes de qualquer ação para garantir dados atualizados
    $sqlAutoUpdate = "UPDATE Financeiro 
                      SET status = 'Vencido' 
                      WHERE status = 'Pendente' 
                      AND vencimento < CURRENT_DATE()";
    $db->query($sqlAutoUpdate);
    // ----------------------------------------

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    $id = $_GET['id'] ?? null;

    // --- LISTAGEM E LEITURA (GET) ---
    if ($method === 'GET') {
        
        // [CORREÇÃO] Se vier um ID, retorna apenas o registro específico (Para Edição)
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM Financeiro WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $registro = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($registro) {
                enviarResponse($registro); // Encerra aqui retornando o objeto {id: 1, ...}
            } else {
                throw new Exception("Registro não encontrado.", 404);
            }
        }

        // --- Lógica Padrão de Listagem (Se não houver ID) ---
        $busca = $_GET['busca'] ?? '';
        $status = $_GET['status'] ?? 'Todos';
        $cat = $_GET['categoria'] ?? 'Todas';
        $dInicio = $_GET['data_inicio'] ?? null;
        $dFim = $_GET['data_fim'] ?? null;

        $pagina = isset($_GET['pagina']) ? (int)$_GET['pagina'] : 1;
        $limite = 10;
        $offset = ($pagina - 1) * $limite;

        // Construção da Query Dinâmica
        $sql = "SELECT * FROM Financeiro WHERE (descricao LIKE :b OR codigo_barras LIKE :b)";
        $params = [':b' => "%$busca%"];

        if ($status !== 'Todos') {
            $sql .= " AND status = :st";
            $params[':st'] = $status;
        }
        if ($cat !== 'Todas') {
            $sql .= " AND categoria = :cat";
            $params[':cat'] = $cat;
        }
        if ($dInicio && $dFim) {
            $sql .= " AND vencimento BETWEEN :di AND :df";
            $params[':di'] = $dInicio;
            $params[':df'] = $dFim;
        }

        // 1. Contagem Total (para paginação)
        $stmtCount = $db->prepare(str_replace("SELECT *", "SELECT COUNT(*)", $sql));
        $stmtCount->execute($params);
        $totalRegistros = $stmtCount->fetchColumn();
        $totalPaginas = ceil($totalRegistros / $limite);

        // 2. Busca Paginada
        $sql .= " ORDER BY vencimento ASC LIMIT $limite OFFSET $offset";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $dados = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response = [
            'success' => true,
            'registros' => $dados,
            'pagina_atual' => $pagina,
            'total_paginas' => $totalPaginas
        ];
    }

    // --- BAIXA DE REGISTRO (POST action=baixar) ---
    elseif ($method === 'POST' && $action === 'baixar') {
        $idBaixa = $id ?? json_decode(file_get_contents("php://input"))->id ?? null;

        if (!$idBaixa) throw new Exception("ID inválido para baixa.");

        // Atualiza status e define data de processamento
        $sql = "UPDATE Financeiro SET status = 'Pago', data_processamento = NOW() WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute([':id' => $idBaixa]);

        if ($stmt->rowCount() > 0) {
            registrarLog($db, $userNome, "Baixar Título", "ID: $idBaixa - Status alterado para Pago");
            $response = ['success' => true, 'message' => 'Título baixado com sucesso!'];
        } else {
            throw new Exception("Registro não encontrado ou já pago.");
        }
    }

    // --- SALVAR / EDITAR (POST action=salvar ou vazio) ---
    elseif ($method === 'POST' && ($action === 'salvar' || empty($action) || $action === 'editar')) {
        $input = json_decode(file_get_contents("php://input"));
        if (!$input) throw new Exception("JSON inválido");

        if (empty($input->descricao) || empty($input->valor)) {
            throw new Exception("Campos obrigatórios faltando (Descrição e Valor).");
        }

        if (!empty($input->id)) {
            $sql = "UPDATE Financeiro SET 
                    descricao=:d, 
                    valor=:v, 
                    vencimento=:ve, 
                    categoria=:c, 
                    status=:s, 
                    codigo_barras=:cb,
                    data_processamento = CASE 
                        WHEN :s = 'Pago' AND data_processamento IS NULL THEN NOW() 
                        WHEN :s != 'Pago' THEN NULL 
                        ELSE data_processamento 
                    END
                    WHERE id=:id";

            $stmt = $db->prepare($sql);
            $stmt->bindValue(':id', $input->id);
            $logAction = "Editar Financeiro";
        } else {
            // INSERT
            $codigoBarras = $input->codigo_barras ?? '';

            if (!empty($codigoBarras)) {
                $checkDup = $db->prepare("SELECT id FROM Financeiro WHERE codigo_barras = :cb LIMIT 1");
                $checkDup->execute([':cb' => $codigoBarras]);

                if ($checkDup->rowCount() > 0) {
                    throw new Exception("Este boleto já foi cadastrado anteriormente", 409);
                }
            }

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

        $response = ['success' => true, 'message' => 'Salvo com sucesso'];
    }

    // --- EXCLUIR (DELETE ou POST action=excluir) ---
    elseif (($method === 'DELETE') || ($method === 'POST' && $action === 'excluir')) {
        $idDel = $id ?? json_decode(file_get_contents("php://input"))->id ?? null;
        if (!$idDel) throw new Exception("ID não fornecido");

        $stmt = $db->prepare("DELETE FROM Financeiro WHERE id = :id");
        $stmt->execute([':id' => $idDel]);
        registrarLog($db, $userNome, "Excluir Financeiro", "ID: $idDel");

        $response = ['success' => true, 'message' => 'Registro excluído'];
    }

} catch (Exception $e) {
    $httpCode = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    // Ajuste para 401 específico se necessário
    if($e->getCode() === 401) $httpCode = 401; 
    
    $response = ['success' => false, 'message' => $e->getMessage()];
}

enviarResponse($response, $httpCode);
?>