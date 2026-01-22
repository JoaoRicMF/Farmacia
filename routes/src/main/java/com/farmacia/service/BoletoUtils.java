package com.farmacia.service;

import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

@Component
public class BoletoUtils {

    // Retorna um objeto simples com os dados (DTO interno)
    public record DadosBoleto(String vencimento, BigDecimal valor, String tipo) {}

    public DadosBoleto decifrarBoleto(String linha) {
        if (linha == null) return new DadosBoleto(null, BigDecimal.ZERO, "");

        // Remove tudo que não é dígito
        linha = linha.replaceAll("\\D", "");

        try {
            if (linha.startsWith("8")) {
                // Concessionária
                BigDecimal val = BigDecimal.ZERO;
                if (linha.length() >= 11) {
                    String valStr = linha.substring(4, 15); // Pega 11 digitos
                    val = new BigDecimal(valStr).divide(new BigDecimal(100));
                }
                return new DadosBoleto(null, val, "Concessionária");
            } else {
                // Bancário
                String fator;
                String valStr;

                if (linha.length() == 47) {
                    fator = linha.substring(33, 37);
                    valStr = linha.substring(37);
                } else if (linha.length() == 44) {
                    fator = linha.substring(5, 9);
                    valStr = linha.substring(9, 19);
                } else {
                    return new DadosBoleto(null, BigDecimal.ZERO, "Inválido");
                }

                LocalDate base = LocalDate.of(1997, 10, 7);
                long dias = Long.parseLong(fator);
                LocalDate venc = base.plusDays(dias);

                // Lógica do Python: while venc < (now - 1000 days)...
                // Ajusta datas antigas devido à reciclagem do fator de vencimento
                while (venc.isBefore(LocalDate.now().minusDays(1000))) {
                    venc = venc.plusDays(9000); // Aproximação do loop python
                }

                String dataFormatada = venc.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                BigDecimal valorFinal = new BigDecimal(valStr).divide(new BigDecimal(100));

                return new DadosBoleto(dataFormatada, valorFinal, "Bancário");
            }
        } catch (Exception e) {
            e.printStackTrace();
            return new DadosBoleto(null, BigDecimal.ZERO, "Erro");
        }
    }
}