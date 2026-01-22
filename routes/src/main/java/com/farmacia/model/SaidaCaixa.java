package com.farmacia.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Entity
public class SaidaCaixa {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String descricao;
    private BigDecimal valor;
    private String formaPagamento;
    private LocalDate dataRegistro;
    private String usuario;
}