<?php
// api/fluxo.php
require_once 'utils.php';
require_once '../config/database.php';
date_default_timezone_set('America/Sao_Paulo');

// --- FUNÇÃO REUTILIZÁVEL (SHARED LOGIC) ---
function obterMovimentacoesFluxo(PDO $db, string $ano, string $mesNum): array {
    // 1. Entradas
    $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'ENTRADA' as tipo, 'Vendas' as categoria, formaPagamento 
                          FROM EntradaCaixa 
                          WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Saídas Manuais
    $stmt = $db->prepare("SELECT id, dataRegistro as data, descricao, valor, 'SAIDA' as tipo, 'Sangria/Despesa' as categoria, NULL as formaPagamento 
                          FROM SaidaCaixa 
                          WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $saidas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Contas Pagas (Financeiro)
    $stmt = $db->prepare("SELECT id, COALESCE(data_processamento, vencimento) as data, descricao, valor, 'SAIDA' as tipo, categoria, NULL as formaPagamento 
                          FROM Financeiro 
                          WHERE status = 'Pago' 
                          AND MONTH(COALESCE(data_processamento, vencimento)) = :m 
                          AND YEAR(COALESCE(data_processamento, vencimento)) = :a");
    $stmt->execute([':m' => $mesNum, ':a' => $ano]);
    $pagos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Consolidação
    $movimentacoes = array_merge($entradas, $saidas, $pagos);
    
    // Ordenação por Data (Decrescente)
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
        $userId = $_SESSION['user_id'];

        // POST: SALVAR (Mantém a lógica de salvamento aqui)
        if ($method === 'POST' && $action === 'salvar') {
             $data = getJsonInput();
             // ... [MANTENHA A LÓGICA DE SALVAR/LOCK AQUI IGUAL AO ANTERIOR] ...
             // (Para economizar espaço na resposta, assuma que o código de POST corrigido na etapa 1 continua aqui)
             
             // ... FIM DO BLOCO POST ...
             exit; // Importante sair após o POST
        }

        // GET: LISTAR FLUXO
        if ($method === 'GET') {
            $mes = $_GET['mes'] ?? date('Y-m');
            if (!preg_match('/^\d{4}-\d{2}$/', $mes)) $mes = date('Y-m');
            list($ano, $mesNum) = explode('-', $mes);

            // >>> CHAMADA DA FUNÇÃO COMPARTILHADA <<<
            $movimentacoes = obterMovimentacoesFluxo($db, $ano, $mesNum);

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
            $stmtTotais = $db->prepare("SELECT formaPagamento, SUM(valor) as total FROM EntradaCaixa WHERE MONTH(dataRegistro) = :m AND YEAR(dataRegistro) = :a GROUP BY formaPagamento");
            $stmtTotais->execute([':m' => $mesNum, ':a' => $ano]);
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