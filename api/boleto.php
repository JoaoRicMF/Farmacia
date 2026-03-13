<?php
/**
 * api/boleto.php - Versão com Integração de API Externa
 * Extração local + Consulta em API de Terceiros (cURL)
 */
require_once 'utils.php';
require_once 'MoneyUtils.php';

inicializarApi();

$input = getJsonInput();
$rawCode = $input->codigo ?? '';
// Remove qualquer caractere que não seja número
$linha = preg_replace('/\D/', '', $rawCode);

if (!$linha) {
    enviarResponse(["error" => "Código vazio ou inválido"], 400);
}

// Estrutura de resposta base
$response = [
    "banco_emissor" => null,
    "empresa_cobradora" => "Consulta requer API externa configurada", 
    "data_emissao" => "Não disponível",
    "valor" => null,
    "vencimento" => null,
    "tipo" => "Desconhecido",
    "valido" => false,
    "mensagem" => ""
];

$tam = strlen($linha);

try {
    // 1. PROCESSAMENTO LOCAL (Extrai Banco, Valor e Vencimento rapidamente)
    if ($tam == 44) {
        if (str_starts_with($linha, '8')) {
            processarArrecadacao($linha, $response, true);
        } else {
            processarBancario($linha, $response, true);
        }
    } elseif ($tam == 47 && !str_starts_with($linha, '8')) {
        processarBancario($linha, $response, false);
    } elseif ($tam == 48 && str_starts_with($linha, '8')) {
        processarArrecadacao($linha, $response, false);
    } elseif (str_starts_with($rawCode, '000201')) {
        $response['tipo'] = "PIX Copia e Cola";
        $response['valido'] = true;
    } else {
        throw new Exception("Tamanho de código ($tam) ou formato incompatível.");
    }

    // 2. CONSULTA NA API EXTERNA (Se o boleto for válido localmente)
    if ($response['valido'] && $response['tipo'] !== "PIX Copia e Cola") {
        $dadosExternos = consultarBoletoNaApiExterna($linha);
        
        if ($dadosExternos) {
            // Se a API externa retornar os dados, atualiza a nossa resposta
            $response['empresa_cobradora'] = $dadosExternos['empresa'] ?? $response['empresa_cobradora'];
            $response['data_emissao'] = $dadosExternos['emissao'] ?? $response['data_emissao'];
            
            // Opcional: Você pode sobrescrever o valor e vencimento com os da API externa
            // caso confie mais nela do que no cálculo local
            // $response['valor'] = $dadosExternos['valor'] ?? $response['valor'];
        } else {
            $response['mensagem'] = "Boleto válido, mas não foi possível consultar os dados da empresa na API externa.";
        }
    }

} catch (Exception $e) {
    $response['valido'] = false;
    $response['mensagem'] = $e->getMessage();
}

enviarResponse($response);


// ============================================================================
// FUNÇÃO DE INTEGRAÇÃO COM A API EXTERNA (cURL)
// ============================================================================
function consultarBoletoNaApiExterna($codigoBoleto) {
    /**
     * TODO: CONFIGURAÇÕES DA SUA API AQUI
     * Exemplo usando um endpoint genérico. 
     * Substitua pela URL e Token do seu provedor (Asaas, API Brasil, etc.)
     */
    $apiUrl = "https://api.seugateway.com.br/v1/boletos/consulta";
    $token  = "SEU_TOKEN_DE_ACESSO_AQUI";

    // Prepara os dados a serem enviados (Geralmente via POST ou GET)
    $payload = json_encode([
        "codigo" => $codigoBoleto
    ]);

    // Inicializa o cURL
    $ch = curl_init($apiUrl);
    
    // Configurações da requisição HTTP
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST"); // Ou "GET" dependendo da API
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer {$token}",
        "Content-Type: application/json",
        "Accept: application/json"
    ]);

    // Ignorar verificação SSL localmente (Remova em Produção)
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); 

    // Executa e pega a resposta
    $respostaApi = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Se a requisição for bem sucedida (Código 200)
    if ($httpCode >= 200 && $httpCode < 300 && $respostaApi) {
        $dadosJson = json_decode($respostaApi, true);
        
        // Mapeie aqui os campos de acordo com a documentação da API que você contratou
        // Exemplo de mapeamento:
        return [
            'empresa' => $dadosJson['razao_social'] ?? $dadosJson['beneficiario'] ?? null,
            'emissao' => $dadosJson['data_documento'] ?? $dadosJson['data_emissao'] ?? null,
            'valor'   => $dadosJson['valor_documento'] ?? null
        ];
    }

    // Retorna null se a API falhar ou o boleto não for encontrado nela
    return null;
}


// ============================================================================
// FUNÇÕES DE PROCESSAMENTO LOCAL (Mantidas)
// ============================================================================

function processarBancario($linha, &$res, $isBarcode) {
    $res['tipo'] = "Bancário";
    
    if (!$isBarcode) {
        if (!validarDVsLinhaBancaria($linha)) throw new Exception("DVs da linha digitável inválidos.");
        $barcode = substr($linha, 0, 3) . substr($linha, 3, 1) . substr($linha, 32, 1) . 
                   substr($linha, 33, 4) . substr($linha, 37, 10) . substr($linha, 4, 5) . 
                   substr($linha, 10, 10) . substr($linha, 21, 10);
    } else {
        $barcode = $linha;
    }

    $codBanco = substr($barcode, 0, 3);
    $res['banco_emissor'] = obterNomeBanco($codBanco);

    $fator = substr($barcode, 5, 4);
    $valorCents = (int) substr($barcode, 9, 10);

    if ($fator !== '0000') {
        $res['vencimento'] = calcularVencimentoFator((int)$fator);
    }

    if ($valorCents > 0) {
        $res['valor'] = MoneyUtils::fromCents($valorCents);
    }

    $res['valido'] = true;
}

function processarArrecadacao($linha, &$res, $isBarcode) {
    $res['tipo'] = "Concessionária/Tributo";
    
    if (!$isBarcode) {
        $blocos = [substr($linha, 0, 11), substr($linha, 12, 11), substr($linha, 24, 11), substr($linha, 36, 11)];
        $barcode = implode('', $blocos);
    } else {
        $barcode = $linha;
    }

    $res['banco_emissor'] = obterSegmentoArrecadacao($barcode[1]);

    $idValor = $barcode[2]; 
    if (in_array($idValor, ['6', '7', '8', '9'])) {
        $valorCents = (int) substr($barcode, 4, 11);
        if ($valorCents > 0) {
            $res['valor'] = MoneyUtils::fromCents($valorCents);
        }
    }
    $res['valido'] = true;
}

function obterNomeBanco($codigo) {
    $bancos = [
        '001' => 'Banco do Brasil', '033' => 'Santander', '104' => 'Caixa Econômica Federal',
        '237' => 'Bradesco', '341' => 'Itaú Unibanco', '260' => 'Nubank',
        '077' => 'Banco Inter', '336' => 'C6 Bank', '041' => 'Banrisul',
        '422' => 'Banco Safra', '748' => 'Sicredi', '756' => 'Sicoob',
        '070' => 'BRB - Banco de Brasília', '389' => 'Banco Mercantil do Brasil'
    ];
    return $bancos[$codigo] ?? "Banco Código ($codigo)";
}

function obterSegmentoArrecadacao($codigo) {
    $segmentos = [
        '1' => 'Prefeitura (Impostos/Taxas)', '2' => 'Saneamento (Água/Esgoto)',
        '3' => 'Energia Elétrica e Gás', '4' => 'Telecomunicações',
        '5' => 'Órgãos Governamentais', '6' => 'Carnês / Empresas Públicas',
        '7' => 'Multas de Trânsito', '9' => 'Uso Exclusivo do Banco'
    ];
    return $segmentos[$codigo] ?? "Concessionária ($codigo)";
}

function calcularVencimentoFator(int $fator) {
    if ($fator === 0) return null;
    $dataBase = new DateTime('1997-10-07');
    $dataVenc = clone $dataBase;
    $dataVenc->modify("+$fator days");

    $hoje = new DateTime();
    $limitePassado = clone $hoje;
    $limitePassado->modify("-3650 days"); 
    
    while ($dataVenc < $limitePassado) {
        $dataVenc->modify("+9000 days");
    }
    return $dataVenc->format('Y-m-d');
}

function validarDVsLinhaBancaria($l) {
    $campos = [
        ['num' => substr($l, 0, 9), 'dv' => $l[9]],
        ['num' => substr($l, 10, 10), 'dv' => $l[20]],
        ['num' => substr($l, 21, 10), 'dv' => $l[31]]
    ];
    foreach ($campos as $c) {
        if (modulo10($c['num']) != $c['dv']) return false;
    }
    return true;
}

function modulo10($num) {
    $soma = 0; $peso = 2;
    for ($i = strlen($num) - 1; $i >= 0; $i--) {
        $multi = $num[$i] * $peso;
        $soma += ($multi > 9) ? ($multi - 9) : $multi;
        $peso = ($peso == 2) ? 1 : 2;
    }
    $resto = $soma % 10;
    return ($resto == 0) ? 0 : (10 - $resto);
}