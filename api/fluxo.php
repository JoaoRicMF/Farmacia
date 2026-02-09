<?php
// api/fluxo.php
require_once 'utils.php';
require_once '../config/database.php';
date_default_timezone_set('America/Sao_Paulo');

// Inicializa API, Sessão e Verifica Login
verificarAuth();

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

function inicializarApi(): void {
    // Garante que a sessão também respeite o horário se houver cookies de expiração
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    header("Access-Control-Allow-Origin: *");
    header("Content-Type: application/json; charset=UTF-8");
}

try {
    $db = (new Database())->getConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    
    // Verifica se a sessão existe para evitar erro de índice indefinido
    if (!isset($_SESSION['user_id'])) {
        throw new Exception("Usuário não autenticado.");
    }
    $userId = $_SESSION['user_id'];

    // --- POST: SALVAR MOVIMENTAÇÃO (CORRIGIDO COM LOCK) ---
    if ($method === 'POST' && $action === 'salvar') {
        $data = getJsonInput(); // Helper do utils.php
        $lockName = 'trava_fluxo_caixa';
        $lockAcquired = false;

        try {
            // 1. Inicia Transação
            $db->beginTransaction();

            // 2. Adquire Lock Exclusivo (Serialização)
            // Aguarda até 10 segundos para pegar a vez
            $stmtLock = $db->query("SELECT GET_LOCK('$lockName', 10)");
            if ($stmtLock->fetchColumn() != 1) {
                throw new Exception("O sistema está processando outra transação. Tente novamente.");
            }
            $lockAcquired = true;

            // --- LÓGICA ORIGINAL DENTRO DA ÁREA SEGURA ---

            // Validação de Saldo para Saídas (exceto se for ENTRADA)
            if (($data->tipo ?? '') !== 'ENTRADA') {
                $mes = date('m', strtotime($data->data_registro));
                $ano = date('Y', strtotime($data->data_registro));

                // Helper local para buscar soma em Centavos
                $getSumCents = function($sql) use ($db, $mes, $ano) {
                    $stmt = $db->prepare($sql);
                    $stmt->execute([':m' => $mes, ':a' => $ano]);
                    return MoneyUtils::toCents($stmt->fetchColumn() ?? 0);
                };

                // Cálculos precisos em Centavos
                $entradasCents = $getSumCents("SELECT SUM(valor) FROM EntradaCaixa WHERE MONTH(dataRegistro)=:m AND YEAR(dataRegistro)=:a");
                $saidasManuaisCents = $getSumCents("SELECT SUM(valor) FROM SaidaCaixa WHERE MONTH(dataRegistro)=:m AND YEAR(dataRegistro)=:a");
                $pagamentosCents = $getSumCents("SELECT SUM(valor) FROM Financeiro WHERE status='Pago' AND MONTH(COALESCE(data_processamento, vencimento))=:m AND YEAR(COALESCE(data_processamento, vencimento))=:a");

                $saldoDisponivelCents = $entradasCents - ($saidasManuaisCents + $pagamentosCents);
                $valorSaidaCents = MoneyUtils::toCents($data->valor);

                if ($valorSaidaCents > $saldoDisponivelCents) {
                    // Libera lock antes de responder erro
                    $db->query("DO RELEASE_LOCK('$lockName')");
                    $db->commit(); // Commit vazio apenas para fechar a transação limpa
                    
                    enviarResponse([
                        "success" => false, 
                        "message" => "Saldo insuficiente! Disponível: R$ " . number_format(MoneyUtils::fromCents($saldoDisponivelCents), 2, ',', '.')
                    ]);
                    exit; 
                }
            }

            // Persistência
            if (($data->tipo ?? '') === 'ENTRADA') {
                $sql = "INSERT INTO EntradaCaixa (dataRegistro, formaPagamento, descricao, valor, id) VALUES (:data, :forma, :desc, :valor, :user)";
                $params = [
                    ":data"  => $data->data_registro,
                    ":forma" => $data->forma_pagamento ?? 'Dinheiro',
                    ":desc"  => $data->descricao,
                    ":valor" => $data->valor,
                    ":user"  => $userId
                ];
            } else {
                $sql = "INSERT INTO SaidaCaixa (dataRegistro, descricao, valor, id) VALUES (:data, :desc, :valor, :user)";
                $params = [
                    ":data"  => $data->data_registro,
                    ":desc"  => $data->descricao,
                    ":valor" => $data->valor,
                    ":user"  => $userId
                ];
            }

            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            // 3. Finalização
            $db->query("DO RELEASE_LOCK('$lockName')");
            $db->commit();
            
            enviarResponse(["success" => true]);

        } catch (Exception $e) {
            // Rollback e Liberação em caso de erro
            if ($db->inTransaction()) $db->rollBack();
            if ($lockAcquired) $db->query("DO RELEASE_LOCK('$lockName')");
            
            // Repassa o erro para o catch principal ou responde aqui
            throw $e;
        }
    } // Fim do if POST

    // --- GET: LISTAR FLUXO (Sem alterações na lógica de leitura) ---
    if ($method === 'GET') {
        $mes = $_GET['mes'] ?? date('Y-m');
        if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
            $mes = date('Y-m');
        }
        list($ano, $mesNum) = explode('-', $mes);

        // 1. Buscas no Banco
        $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Sangria/Despesa' as categoria FROM SaidaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $db->prepare("SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria FROM Financeiro WHERE status = 'Pago' AND MONTH(COALESCE(data_processamento, vencimento)) = :m AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
        $stmt->execute([':m' => $mesNum, ':a' => $ano]);
        $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 2. Consolidação e Cálculo
        $movimentacoes = array_merge($entradas, $saidas, $pagos);
        
        usort($movimentacoes, function($a, $b) {
            return strtotime($b['data']) - strtotime($a['data']);
        });

        $totalEntCents = 0;
        $totalSaiCents = 0;

        foreach ($movimentacoes as &$mov) {
            $valCents = MoneyUtils::toCents($mov['valor']);
            $mov['valor_fmt'] = "R$ " . number_format(MoneyUtils::fromCents($valCents), 2, ',', '.');
            $mov['data_fmt']  = date('d/m/Y', strtotime($mov['data']));

            if ($mov['tipo'] == 'ENTRADA') {
                $totalEntCents += $valCents;
            } else {
                $totalSaiCents += $valCents;
            }
        }
        unset($mov); 

        // 3. Totais por Forma de Pagamento
        $stmtTotais = $db->prepare("SELECT formaPagamento, SUM(valor) as total FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a GROUP BY formaPagamento");
        $stmtTotais->execute([':m' => $mesNum, ':a' => $ano]);
        $formas = $stmtTotais->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

        $totalDinheiroCents = MoneyUtils::toCents($formas['Dinheiro'] ?? 0);
        $totalPixCents      = MoneyUtils::toCents($formas['PIX'] ?? 0);
        $totalCartaoCents   = MoneyUtils::toCents($formas['Cartão'] ?? 0);

        // 4. Resposta Final
        $saldoCents = $totalEntCents - $totalSaiCents;

        enviarResponse([
            "movimentacoes" => $movimentacoes,
            "total_entradas_fmt" => "R$ " . number_format(MoneyUtils::fromCents($totalEntCents), 2, ',', '.'),
            "total_saidas_fmt"   => "R$ " . number_format(MoneyUtils::fromCents($totalSaiCents), 2, ',', '.'),
            "saldo_fmt"          => "R$ " . number_format(MoneyUtils::fromCents($saldoCents), 2, ',', '.'),
            "total_dinheiro" => "R$ " . number_format(MoneyUtils::fromCents($totalDinheiroCents), 2, ',', '.'),
            "total_pix"      => "R$ " . number_format(MoneyUtils::fromCents($totalPixCents), 2, ',', '.'),
            "total_cartao"   => "R$ " . number_format(MoneyUtils::fromCents($totalCartaoCents), 2, ',', '.')
        ]);
    } 

} catch (Exception $e) { 
    if (function_exists('enviarResponse')) {
        enviarResponse(["success" => false, "message" => "Erro: " . $e->getMessage()], 200);
    } else {
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode(["error" => $e->getMessage()]);
    }
}
?>