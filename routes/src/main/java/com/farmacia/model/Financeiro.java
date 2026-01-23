package com.farmacia.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
public class Financeiro {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    private String descricao;
    private BigDecimal valor;
    private LocalDate vencimento;
    private String status; // Pendente ou Pago
    private String categoria;
    private LocalDateTime dataProcessamento;
    private String codigoBarras;
}