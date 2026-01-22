package com.farmacia.model;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Entity
public class EntradaCaixa {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private BigDecimal valor;
    private String formaPagamento; // Dinheiro, PIX, Cartão
    private LocalDate dataRegistro;
    private String usuario; // Quem registrou
}