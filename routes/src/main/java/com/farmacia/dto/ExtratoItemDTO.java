package com.farmacia.dto;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
public class ExtratoItemDTO {
    private Integer id;
    private String data; // String formatada dd/MM/yyyy para o front
    private LocalDate dataOrdenacao; // Para ordenar no backend
    private String descricao;
    private BigDecimal valor;
    private String tipo; // "entrada", "saida_caixa", "saida_boleto"
    private String categoria;
}