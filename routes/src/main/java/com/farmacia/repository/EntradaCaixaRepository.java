package com.farmacia.repository;

import com.farmacia.model.EntradaCaixa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface EntradaCaixaRepository extends JpaRepository<EntradaCaixa, Integer> {

    @Query("SELECT SUM(e.valor) FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes")
    BigDecimal somarPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT SUM(e.valor) FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes AND e.formaPagamento = :forma")
    BigDecimal somarPorMesEForma(@Param("ano") int ano, @Param("mes") int mes, @Param("forma") String forma);

    @Query("SELECT e FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes")
    List<EntradaCaixa> listarPorMes(@Param("ano") int ano, @Param("mes") int mes);
}