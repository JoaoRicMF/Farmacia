package com.farmacia.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor; // Adicionado
import lombok.Data;
import lombok.NoArgsConstructor; // Adicionado
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor // Obrigatório para o Banco de Dados
@AllArgsConstructor // Necessário para o Lombok funcionar 100%
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