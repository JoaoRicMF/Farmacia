package com.farmacia.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor // Obrigatório
@AllArgsConstructor // Obrigatório para o @Builder funcionar
public class ExtratoItemDTO {
    private Integer id;
    private String data;
    private LocalDate dataOrdenacao;
    private String descricao;
    private BigDecimal valor;
    private String tipo;
    private String categoria;
}