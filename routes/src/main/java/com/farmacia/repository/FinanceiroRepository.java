package com.farmacia.repository;

import com.farmacia.model.Financeiro;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.time.LocalDate;
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

    // --- QUERIES OTIMIZADAS PARA DASHBOARD ---

    // Soma pagamentos pendentes no mês/ano
    @Query("SELECT COALESCE(SUM(f.valor), 0) FROM Financeiro f WHERE f.status <> 'Pago' AND YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    BigDecimal somarAPagarMes(@Param("ano") int ano, @Param("mes") int mes);

    // Soma pagos no mês/ano
    @Query("SELECT COALESCE(SUM(f.valor), 0) FROM Financeiro f WHERE f.status = 'Pago' AND YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    BigDecimal somarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);

    // Lista pagos no mês (usado no extrato)
    @Query("SELECT f FROM Financeiro f WHERE f.status = 'Pago' AND YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    List<Financeiro> listarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);

    // Vencidos (não pagos e data anterior a hoje)
    @Query("SELECT f FROM Financeiro f WHERE f.status <> 'Pago' AND f.vencimento < :hoje")
    List<Financeiro> findVencidos(@Param("hoje") LocalDate hoje);

    @Query("SELECT COALESCE(SUM(f.valor), 0) FROM Financeiro f WHERE f.status <> 'Pago' AND f.vencimento < :hoje")
    BigDecimal somarVencidos(@Param("hoje") LocalDate hoje);

    // Próximos (não pagos, data entre hoje e data limite)
    @Query("SELECT f FROM Financeiro f WHERE f.status <> 'Pago' AND f.vencimento >= :hoje AND f.vencimento <= :limite")
    List<Financeiro> findProximos(@Param("hoje") LocalDate hoje, @Param("limite") LocalDate limite);

    @Query("SELECT COALESCE(SUM(f.valor), 0) FROM Financeiro f WHERE f.status <> 'Pago' AND f.vencimento >= :hoje AND f.vencimento <= :limite")
    BigDecimal somarProximos(@Param("hoje") LocalDate hoje, @Param("limite") LocalDate limite);

    // Agrupamento por categoria (retorna array de objetos)
    @Query("SELECT f.categoria, SUM(f.valor) FROM Financeiro f WHERE MONTH(f.vencimento) = :mes AND YEAR(f.vencimento) = :ano GROUP BY f.categoria")
    List<Object[]> agruparPorCategoria(@Param("ano") int ano, @Param("mes") int mes);
}