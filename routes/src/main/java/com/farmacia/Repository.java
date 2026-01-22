import com.farmacia.model.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {
    Optional<Usuario> findByUsuario(String usuario);
    Optional<Usuario> findByNome(String nome);
}

@Repository
public interface FinanceiroRepository extends JpaRepository<Financeiro, Integer> {

    // Substitui os filtros dinâmicos do Python
    @Query("SELECT f FROM Financeiro f WHERE " +
            "(:busca IS NULL OR LOWER(f.descricao) LIKE LOWER(CONCAT('%', :busca, '%'))) AND " +
            "(:status = 'Todos' OR f.status = :status) AND " +
            "(:categoria = 'Todas' OR f.categoria = :categoria)")
    Page<Financeiro> buscarComFiltros(@Param("busca") String busca,
                                      @Param("status") String status,
                                      @Param("categoria") String categoria,
                                      Pageable pageable);

    boolean existsByCodigoBarras(String codigoBarras);

    // Para o Fluxo de Caixa (Boletos Pagos)
    @Query("SELECT SUM(f.valor) FROM Financeiro f WHERE f.status = 'Pago' AND " +
            "YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    BigDecimal somarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT f FROM Financeiro f WHERE f.status = 'Pago' AND " +
            "YEAR(f.vencimento) = :ano AND MONTH(f.vencimento) = :mes")
    List<Financeiro> listarPagosPorMes(@Param("ano") int ano, @Param("mes") int mes);
}

@Repository
public interface EntradaCaixaRepository extends JpaRepository<EntradaCaixa, Integer> {
    @Query("SELECT SUM(e.valor) FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes")
    BigDecimal somarPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT SUM(e.valor) FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes AND e.formaPagamento = :forma")
    BigDecimal somarPorMesEForma(@Param("ano") int ano, @Param("mes") int mes, @Param("forma") String forma);

    @Query("SELECT e FROM EntradaCaixa e WHERE YEAR(e.dataRegistro) = :ano AND MONTH(e.dataRegistro) = :mes")
    List<EntradaCaixa> listarPorMes(@Param("ano") int ano, @Param("mes") int mes);
}

@Repository
public interface SaidaCaixaRepository extends JpaRepository<SaidaCaixa, Integer> {
    @Query("SELECT SUM(s.valor) FROM SaidaCaixa s WHERE YEAR(s.dataRegistro) = :ano AND MONTH(s.dataRegistro) = :mes")
    BigDecimal somarPorMes(@Param("ano") int ano, @Param("mes") int mes);

    @Query("SELECT s FROM SaidaCaixa s WHERE YEAR(s.dataRegistro) = :ano AND MONTH(s.dataRegistro) = :mes")
    List<SaidaCaixa> listarPorMes(@Param("ano") int ano, @Param("mes") int mes);
}

@Repository
public interface LogRepository extends JpaRepository<Log, Integer> {
    List<Log> findTop100ByOrderByIdDesc();
}

@Repository
public interface FornecedorRepository extends JpaRepository<Fornecedor, Integer> {
    List<Fornecedor> findAllByOrderByNomeAsc();
    boolean existsByNome(String nome);
}