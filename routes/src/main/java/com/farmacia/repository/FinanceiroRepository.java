package com.farmacia.repository;

import com.farmacia.model.Financeiro;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface FinanceiroRepository extends JpaRepository<Financeiro, Integer> {

    @Query("SELECT f FROM Financeiro f WHERE " +
            "(:busca IS NULL OR LOWER(f.descricao) LIKE LOWER(CONCAT('%', :busca, '%'))) AND " +
            "(:status = 'Todos' OR f.status = :status) AND " +
            "(:categoria = 'Todas' OR f.categoria = :categoria)")
    Page<Financeiro> buscarComFiltros(@Param("busca") String busca,
                                      @Param("status") String status,
                                      @Param("categoria") String categoria,
                                      Pageable pageable);

    boolean existsByCodigoBarras(String codigoBarras);

    @Query("SELECT SUM(f.valor) FROM Financeiro f WHERE f.status = 'Pago' AND YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    BigDecimal somarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT f FROM Financeiro f WHERE f.status = 'Pago' AND YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    List<Financeiro> listarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);
}