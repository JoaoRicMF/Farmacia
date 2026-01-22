package com.farmacia.repository;

import com.farmacia.model.Fornecedor;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FornecedorRepository extends JpaRepository<Fornecedor, Integer> {
    List<Fornecedor> findAllByOrderByNomeAsc();
    boolean existsByNome(String nome);
}