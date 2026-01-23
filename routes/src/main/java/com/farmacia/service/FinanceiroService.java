package com.farmacia.service;

import com.farmacia.dto.ExtratoItemDTO;
import com.farmacia.model.*;
import com.farmacia.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FinanceiroService {

    @Autowired private FinanceiroRepository financeiroRepo;
    @Autowired private EntradaCaixaRepository entradaRepo;
    @Autowired private SaidaCaixaRepository saidaRepo;
    @Autowired private FornecedorRepository fornecedorRepo;
    @Autowired private UsuarioService usuarioService;

    // --- REGISTROS FINANCEIROS ---

    public Page<Financeiro> listarRegistros(String busca, String status, String categoria, Pageable pageable) {
        status = (status == null || status.isEmpty()) ? "Todos" : status;
        categoria = (categoria == null || categoria.isEmpty()) ? "Todas" : categoria;
        busca = (busca == null) ? "" : busca;
        return financeiroRepo.buscarComFiltros(busca, status, categoria, pageable);
    }

    @Transactional
    public void adicionarRegistro(String userLog, Financeiro f) {
        f.setDataProcessamento(LocalDateTime.now());
        financeiroRepo.save(f);
        usuarioService.registrarLog(userLog, "Novo Lançamento", "R$ " + f.getValor() + " - " + f.getDescricao());
    }

    @Transactional
    public void editarRegistro(String userLog, Integer id, Financeiro dados) {
        financeiroRepo.findById(id).ifPresent(reg -> {
            reg.setDescricao(dados.getDescricao());
            reg.setValor(dados.getValor());
            reg.setVencimento(dados.getVencimento());
            reg.setCategoria(dados.getCategoria());
            reg.setStatus(dados.getStatus());
            financeiroRepo.save(reg);
            usuarioService.registrarLog(userLog, "Edição", "Editou registro ID: " + id);
        });
    }

    @Transactional
    public void atualizarStatus(String userLog, Integer id, String novoStatus) {
        financeiroRepo.findById(id).ifPresent(reg -> {
            reg.setStatus(novoStatus);
            financeiroRepo.save(reg);
            usuarioService.registrarLog(userLog, "Status", "Mudou ID " + id + " para " + novoStatus);
        });
    }

    @Transactional
    public void excluirRegistro(String userLog, Integer id) {
        financeiroRepo.findById(id).ifPresent(reg -> {
            financeiroRepo.delete(reg);
            usuarioService.registrarLog(userLog, "Exclusão", "Apagou: " + reg.getDescricao());
        });
    }

    // --- DASHBOARD ---

    public Map<String, Object> obterDadosDashboard(String periodo) {
        LocalDate hoje = LocalDate.now();
        int mesAtual = hoje.getMonthValue();
        int anoAtual = hoje.getYear();

        // Buscas otimizadas no banco
        BigDecimal pagarMes = financeiroRepo.somarAPagarMes(anoAtual, mesAtual);
        BigDecimal pagoMes = financeiroRepo.somarPagosPorMes(anoAtual, mesAtual);

        BigDecimal vencidosVal = financeiroRepo.somarVencidos(hoje);
        // Contagem pode ser feita com .size() ou COUNT no banco, .size() na lista retornada é aceitável se a lista não for gigante
        List<Financeiro> listaVencidos = financeiroRepo.findVencidos(hoje);

        LocalDate limiteProximos = hoje.plusDays(5);
        BigDecimal proximosVal = financeiroRepo.somarProximos(hoje, limiteProximos);
        List<Financeiro> listaProximos = financeiroRepo.findProximos(hoje, limiteProximos);

        // Gráficos por Categoria (via Banco)
        List<Object[]> dadosCategoria = financeiroRepo.agruparPorCategoria(anoAtual, mesAtual);
        List<Map<String, Object>> graficoCat = new ArrayList<>();

        for (Object[] row : dadosCategoria) {
            graficoCat.add(Map.of("categoria", row[0], "total", row[1]));
        }

        // Estrutura de Resposta
        Map<String, Object> cards = new HashMap<>();
        cards.put("pagar_mes", pagarMes);
        cards.put("pago_mes", pagoMes);
        cards.put("vencidos_val", vencidosVal);
        cards.put("vencidos_qtd", listaVencidos.size());
        cards.put("proximos_val", proximosVal);
        cards.put("proximos_qtd", listaProximos.size());

        Map<String, Object> graficos = new HashMap<>();
        graficos.put("por_categoria", graficoCat);
        graficos.put("por_mes", List.of(Map.of("mes", "Atual", "total", pagarMes.add(pagoMes))));

        return Map.of("cards", cards, "graficos", graficos);
    }

    public List<Map<String, Object>> obterEventosCalendario() {
        // Para calendário, ainda precisamos de muitos dados, mas idealmente filtraríamos por intervalo de datas.
        // Mantido findAll() apenas se a base for pequena, senão criar findByVencimentoBetween.
        return financeiroRepo.findAll().stream().map(f -> {
            Map<String, Object> evento = new HashMap<>();
            evento.put("title", f.getDescricao() + " (" + f.getValor() + ")");
            evento.put("start", f.getVencimento().toString());
            evento.put("color", f.getStatus().equals("Pago") ? "#10b981" : (f.getVencimento().isBefore(LocalDate.now()) ? "#ef4444" : "#3b82f6"));
            return evento;
        }).collect(Collectors.toList());
    }

    public List<Financeiro> listarDetalhesCard(String tipo) {
        LocalDate hoje = LocalDate.now();
        if ("vencidos".equals(tipo)) {
            return financeiroRepo.findVencidos(hoje);
        } else if ("proximos".equals(tipo)) {
            return financeiroRepo.findProximos(hoje, hoje.plusDays(7));
        }
        return new ArrayList<>();
    }

    // --- FLUXO DE CAIXA ---

    public Map<String, Object> obterResumoFluxo(int mes, int ano) {
        BigDecimal entradasTotal = Optional.ofNullable(entradaRepo.somarPorMes(ano, mes)).orElse(BigDecimal.ZERO);
        BigDecimal saidasTotal = Optional.ofNullable(saidaRepo.somarPorMes(ano, mes)).orElse(BigDecimal.ZERO);
        BigDecimal boletosPagos = Optional.ofNullable(financeiroRepo.somarPagosPorMes(ano, mes)).orElse(BigDecimal.ZERO);

        BigDecimal saldo = entradasTotal.subtract(saidasTotal.add(boletosPagos));

        List<ExtratoItemDTO> extrato = new ArrayList<>();
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy");

        entradaRepo.listarPorMes(ano, mes).forEach(e -> extrato.add(ExtratoItemDTO.builder()
                .id(e.getId()).dataOrdenacao(e.getDataRegistro()).data(e.getDataRegistro().format(dtf))
                .descricao("Entrada Avulsa").valor(e.getValor()).tipo("entrada").categoria(e.getFormaPagamento()).build()));

        saidaRepo.listarPorMes(ano, mes).forEach(s -> extrato.add(ExtratoItemDTO.builder()
                .id(s.getId()).dataOrdenacao(s.getDataRegistro()).data(s.getDataRegistro().format(dtf))
                .descricao(s.getDescricao()).valor(s.getValor()).tipo("saida_caixa").categoria(s.getFormaPagamento()).build()));

        financeiroRepo.listarPagosPorMes(ano, mes).forEach(f -> extrato.add(ExtratoItemDTO.builder()
                .id(f.getId()).dataOrdenacao(f.getVencimento()).data(f.getVencimento().format(dtf))
                .descricao(f.getDescricao()).valor(f.getValor()).tipo("saida_boleto").categoria("Boleto Pago").build()));

        extrato.sort((a, b) -> b.getDataOrdenacao().compareTo(a.getDataOrdenacao()));

        Map<String, Object> resumo = new HashMap<>();
        resumo.put("entradas_total", entradasTotal);
        resumo.put("entradas_dinheiro", Optional.ofNullable(entradaRepo.somarPorMesEForma(ano, mes, "Dinheiro")).orElse(BigDecimal.ZERO));
        resumo.put("entradas_pix", Optional.ofNullable(entradaRepo.somarPorMesEForma(ano, mes, "PIX")).orElse(BigDecimal.ZERO));
        resumo.put("entradas_cartao", Optional.ofNullable(entradaRepo.somarPorMesEForma(ano, mes, "Cartão")).orElse(BigDecimal.ZERO));
        resumo.put("saidas_total", saidasTotal.add(boletosPagos));
        resumo.put("saldo", saldo);
        resumo.put("extrato", extrato);
        return resumo;
    }

    @Transactional
    public void adicionarEntrada(String user, EntradaCaixa entrada) {
        entrada.setUsuario(user);
        entradaRepo.save(entrada);
        usuarioService.registrarLog(user, "Fluxo Entrada", "R$ " + entrada.getValor());
    }

    @Transactional
    public void adicionarSaidaCaixa(String user, SaidaCaixa saida) {
        saida.setUsuario(user);
        saidaRepo.save(saida);
        usuarioService.registrarLog(user, "Fluxo Saída", "R$ " + saida.getValor() + " - " + saida.getDescricao());
    }

    @Transactional
    public void excluirEntrada(String user, Integer id) {
        entradaRepo.deleteById(id);
        usuarioService.registrarLog(user, "Exclusão Fluxo", "Entrada ID: " + id);
    }

    @Transactional
    public void excluirSaidaCaixa(String user, Integer id) {
        saidaRepo.deleteById(id);
        usuarioService.registrarLog(user, "Exclusão Fluxo", "Saída ID: " + id);
    }

    // --- FORNECEDORES ---

    public List<Fornecedor> listarFornecedores() { return fornecedorRepo.findAllByOrderByNomeAsc(); }

    @Transactional
    public String adicionarFornecedor(String user, String nome, String categoria) {
        if (fornecedorRepo.existsByNome(nome)) return "Fornecedor já cadastrado.";
        Fornecedor f = new Fornecedor();
        f.setNome(nome);
        f.setCategoriaPadrao(categoria);
        f.setUsuarioCriacao(user);
        fornecedorRepo.save(f);
        return "Sucesso";
    }

    @Transactional
    public void excluirFornecedor(String user, Integer id) {
        fornecedorRepo.deleteById(id);
        usuarioService.registrarLog(user, "Configuração", "Excluiu fornecedor ID: " + id);
    }
}