package com.farmacia.repository;

import com.farmacia.model.SaidaCaixa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface SaidaCaixaRepository extends JpaRepository<SaidaCaixa, Integer> {

    @Query("SELECT SUM(s.valor) FROM SaidaCaixa s WHERE YEAR(s.dataRegistro) = :ano AND MONTH(s.dataRegistro) = :mes")
    BigDecimal somarPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT s FROM SaidaCaixa s WHERE YEAR(s.dataRegistro) = :ano AND MONTH(s.dataRegistro) = :mes")
    List<SaidaCaixa> listarPorMes(@Param("ano") int ano, @Param("mes") int mes);
}