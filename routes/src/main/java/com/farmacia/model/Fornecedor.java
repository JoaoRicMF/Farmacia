package com.farmacia.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
public class Fornecedor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String nome;
    private String categoriaPadrao;
    private String usuarioCriacao;
}