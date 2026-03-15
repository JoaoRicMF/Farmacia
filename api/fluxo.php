<?php
// api/fluxo.php
require_once 'utils.php';
require_once '../config/database.php';
date_default_timezone_set('America/Sao_Paulo');

// --- FUNÇÃO REUTILIZÁVEL (SHARED LOGIC) ---
function obterMovimentacoesFluxo(PDO $db, string $ano, string $mesNum, int $idUnidade): array {
    // 1. Entradas (Vendas/Ingressos)
    $dataInicio = "$ano-$mesNum-01";
    $dataFim    = date('Y-m-t', strtotime($dataInicio)); // último dia do mês
    $stmt = $db->prepare("SELECT id_entrada as id, dataRegistro as data, descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria, formaPagamento 
                          FROM entradacaixa 
                          WHERE id_unidade = :u AND dataRegistro BETWEEN :di AND :df");
    $stmt->execute([':u' => $idUnidade, ':di' => "$dataInicio 00:00:00", ':df' => "$dataFim 23:59:59"]);
    $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Saídas (Todas: Manuais + Baixas de Boletos)
    // Nota: Como a baixa agora insere aqui, não precisamos mais ler a tabela Financeiro!
    $stmt = $db->prepare("SELECT id_saida as id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Despesa' as categoria, NULL as formaPagamento 
                          FROM saidacaixa 
                          WHERE id_unidade = :u AND dataRegistro BETWEEN :di AND :df");
    $stmt->execute([':u' => $idUnidade, ':di' => "$dataInicio 00:00:00", ':df' => "$dataFim 23:59:59"]);
    $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Consolidação
    $movimentacoes = array_merge($entradas, $saidas);
    
    // Ordenação
    usort($movimentacoes, function($a, $b) {
        return strtotime($b['data']) - strtotime($a['data']);
    });

    return $movimentacoes;
}

// --- EXECUÇÃO DA API (APENAS SE CHAMADO DIRETAMENTE) ---
// O if abaixo permite que este arquivo seja incluído em exportar.php sem rodar a lógica de resposta JSON
if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {

    // Inicializa API, Sessão e Verifica Login
    verificarAuth();

    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    error_reporting(E_ALL);

    try {
        $db = (new Database())->getConnection();
        $method = $_SERVER['REQUEST_METHOD'];
        $action = $_GET['action'] ?? '';
        
        if (!isset($_SESSION['user_id'])) {
            throw new Exception("Usuário não autenticado.");
        }
        $userId    = $_SESSION['user_id'];
        $idUnidade = $_SESSION['id_unidade_ativa'] ?? null;
        if (!$idUnidade) {
            enviarResponse(["success" => false, "message" => "Nenhuma unidade ativa na sessão."], 403);
            exit;
        }

        // POST: SALVAR (Mantém a lógica de salvamento aqui)
        // POST: SALVAR
        if ($method === 'POST' && $action === 'salvar') {
            $data = getJsonInput();

            // 1. Validação
            if (empty($data->descricao) || empty($data->valor) || empty($data->tipo)) {
                throw new Exception("Dados incompletos (Descrição, Valor e Tipo são obrigatórios).", 400);
            }

            $valor = (float) $data->valor;
            if ($valor <= 0) {
                throw new Exception("O valor deve ser maior que zero.", 400);
            }

            // Adiciona a hora atual à data recebida para manter a ordem cronológica correta no dia
            $dataRegistro = ($data->data_registro ?? date('Y-m-d')) . ' ' . date('H:i:s');
            $formaPgto = $data->forma_pagamento ?? 'Dinheiro';

            try {
                $db->beginTransaction();

                if ($data->tipo === 'ENTRADA') {
                    // Tabela EntradaCaixa possui coluna 'formaPagamento' nativa
                    $stmt = $db->prepare("INSERT INTO entradacaixa (dataRegistro, descricao, valor, formaPagamento, id, id_unidade) VALUES (:dt, :desc, :val, :forma, :uid, :u)");
                    $stmt->execute([
                        ':dt'    => $dataRegistro,
                        ':desc'  => $data->descricao,
                        ':val'   => $valor,
                        ':forma' => $formaPgto,
                        ':uid'   => $userId,
                        ':u'     => $idUnidade
                    ]);

                    registrarLog($db, $_SESSION['user_nome'], "Fluxo Entrada", "R$ $valor - $data->descricao");

                } elseif ($data->tipo === 'SAIDA') {
                    // Tabela SaidaCaixa NÃO tem 'formaPagamento' (ver config/database.php),
                    // então concatenamos essa informação na descrição para não perdê-la.
                    $descricaoCompleta = $data->descricao . " (" . $formaPgto . ")";

                    $stmt = $db->prepare("INSERT INTO saidacaixa (dataRegistro, descricao, valor, id, id_unidade) VALUES (:dt, :desc, :val, :uid, :u)");
                    $stmt->execute([
                        ':dt'    => $dataRegistro,
                        ':desc'  => $descricaoCompleta,
                        ':val'   => $valor,
                        ':uid'   => $userId,
                        ':u'     => $idUnidade
                    ]);

                    registrarLog($db, $_SESSION['user_nome'], "Fluxo Saída", "R$ $valor - $descricaoCompleta");

                } else {
                    throw new Exception("Tipo de movimentação inválido (Use ENTRADA ou SAIDA).", 400);
                }

                $db->commit();

                // --------------------------------------------------------
                // MOTOR DE APRENDIZADO: grava assinatura → fornecedor
                // para que boleto.php consiga "adivinhar" futuramente.
                // Só aprende com boletos bancários (44 dígitos).
                // --------------------------------------------------------
                if ($data->tipo === 'SAIDA' && !empty($data->codigo_barras) && !empty($data->descricao)) {
                    try {
                        require_once 'boleto.php';
                        $codigoLimpo = preg_replace('/[^0-9]/', '', $data->codigo_barras);
                        if (strlen($codigoLimpo) === 44) {
                            $assinatura = gerarAssinaturaBoleto($codigoLimpo);
                            if ($assinatura) {
                                $stmtAprender = $db->prepare("
                                    INSERT INTO boleto_assinaturas (assinatura, nome_fornecedor)
                                    VALUES (?, ?)
                                    ON DUPLICATE KEY UPDATE nome_fornecedor = VALUES(nome_fornecedor)
                                ");
                                $stmtAprender->execute([$assinatura, $data->descricao]);
                            }
                        }
                    } catch (Exception $eLearning) {
                        // Falha silenciosa: não cancela o salvamento se a tabela ainda não existir
                        error_log("[fluxo.php] Erro ao gravar assinatura: " . $eLearning->getMessage());
                    }
                }

                enviarResponse(["success" => true, "message" => "Movimentação registrada com sucesso!"]);

            } catch (Exception $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }

            exit; // Importante sair após o POST
        }

        // GET: LISTAR FLUXO
        if ($method === 'GET') {
            $mes = $_GET['mes'] ?? date('Y-m');
            if (!preg_match('/^\d{4}-\d{2}$/', $mes)) $mes = date('Y-m');
            list($ano, $mesNum) = explode('-', $mes);

            // >>> CHAMADA DA FUNÇÃO COMPARTILHADA <<<
            $dataInicio = "$ano-$mesNum-01";
            $dataFim    = date('Y-m-t', strtotime($dataInicio));
            $movimentacoes = obterMovimentacoesFluxo($db, $ano, $mesNum, (int)$idUnidade);

            // Cálculos de Totais para o JSON
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


            // Totais Específicos (Dinheiro/Pix) mantêm query separada pois é agrupamento
            $stmtTotais = $db->prepare("SELECT formaPagamento, SUM(valor) as total FROM entradacaixa WHERE id_unidade = :u AND dataRegistro BETWEEN :di AND :df GROUP BY formaPagamento");
            $stmtTotais->execute([':u' => $idUnidade, ':di' => "$dataInicio 00:00:00", ':df' => "$dataFim 23:59:59"]);
            $formas = $stmtTotais->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

            $saldoCents = $totalEntCents - $totalSaiCents;

            enviarResponse([
                "movimentacoes" => $movimentacoes,
                "total_entradas_fmt" => "R$ " . number_format(MoneyUtils::fromCents($totalEntCents), 2, ',', '.'),
                "total_saidas_fmt"   => "R$ " . number_format(MoneyUtils::fromCents($totalSaiCents), 2, ',', '.'),
                "saldo_fmt"          => "R$ " . number_format(MoneyUtils::fromCents($saldoCents), 2, ',', '.'),
                "total_dinheiro" => "R$ " . number_format(MoneyUtils::fromCents(MoneyUtils::toCents($formas['Dinheiro'] ?? 0)), 2, ',', '.'),
                "total_pix"      => "R$ " . number_format(MoneyUtils::fromCents(MoneyUtils::toCents($formas['PIX'] ?? 0)), 2, ',', '.'),
                "total_cartao"   => "R$ " . number_format(MoneyUtils::fromCents(MoneyUtils::toCents($formas['Cartão'] ?? 0)), 2, ',', '.')
            ]);
        }

    } catch (Exception $e) {
        enviarResponse(["success" => false, "message" => "Erro: " . $e->getMessage()], 500);
    }
}
?>