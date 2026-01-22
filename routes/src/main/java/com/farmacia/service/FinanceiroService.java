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
    @Autowired private UsuarioService usuarioService; // Para logs

    // --- REGISTROS FINANCEIROS (Boletos) ---

    public Page<Financeiro> listarRegistros(String busca, String status, String categoria, Pageable pageable) {
        // Tratamento de nulos igual ao Python
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
    public void editarRegistro(String userLog, Integer id, Financeiro dadosNovos) {
        financeiroRepo.findById(id).ifPresent(reg -> {
            String detalhe = "De: " + reg.getValor() + " Para: " + dadosNovos.getValor();
            reg.setDescricao(dadosNovos.getDescricao());
            reg.setValor(dadosNovos.getValor());
            reg.setVencimento(dadosNovos.getVencimento());
            reg.setCategoria(dadosNovos.getCategoria());
            reg.setStatus(dadosNovos.getStatus());
            financeiroRepo.save(reg);
            usuarioService.registrarLog(userLog, "Edição", detalhe);
        });
    }

    @Transactional
    public void excluirRegistro(String userLog, Integer id) {
        financeiroRepo.findById(id).ifPresent(reg -> {
            financeiroRepo.delete(reg);
            usuarioService.registrarLog(userLog, "Exclusão", "Apagou: " + reg.getDescricao());
        });
    }

    // --- FLUXO DE CAIXA COMPLEXO (O antigo obter_resumo_fluxo) ---

    public Map<String, Object> obterResumoFluxo(int mes, int ano) {
        Map<String, Object> resumo = new HashMap<>();

        // 1. Cálculos de Totais (BigDecimal lida melhor com Null do que double primitivo)
        BigDecimal entradasTotal = entradaRepo.somarPorMes(ano, mes);
        BigDecimal entradasDin = entradaRepo.somarPorMesEForma(ano, mes, "Dinheiro");
        BigDecimal entradasPix = entradaRepo.somarPorMesEForma(ano, mes, "PIX");
        BigDecimal entradasCart = entradaRepo.somarPorMesEForma(ano, mes, "Cartão");

        BigDecimal saidasTotal = saidaRepo.somarPorMes(ano, mes);
        BigDecimal boletosPagos = financeiroRepo.somarPagosPorMes(ano, mes);

        // Trata nulls vindos do banco
        entradasTotal = (entradasTotal == null) ? BigDecimal.ZERO : entradasTotal;
        saidasTotal = (saidasTotal == null) ? BigDecimal.ZERO : saidasTotal;
        boletosPagos = (boletosPagos == null) ? BigDecimal.ZERO : boletosPagos;

        BigDecimal totalSaidasGeral = saidasTotal.add(boletosPagos);
        BigDecimal saldo = entradasTotal.subtract(totalSaidasGeral);

        resumo.put("entradas_total", entradasTotal);
        resumo.put("entradas_dinheiro", entradasDin != null ? entradasDin : BigDecimal.ZERO);
        resumo.put("entradas_pix", entradasPix != null ? entradasPix : BigDecimal.ZERO);
        resumo.put("entradas_cartao", entradasCart != null ? entradasCart : BigDecimal.ZERO);
        resumo.put("saidas_total", totalSaidasGeral);
        resumo.put("saldo", saldo);

        // 2. Construção do Extrato Unificado
        List<ExtratoItemDTO> extrato = new ArrayList<>();
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy");

        // Adiciona Entradas
        List<EntradaCaixa> listEnt = entradaRepo.listarPorMes(ano, mes);
        for (EntradaCaixa e : listEnt) {
            extrato.add(ExtratoItemDTO.builder()
                    .id(e.getId())
                    .dataOrdenacao(e.getDataRegistro())
                    .data(e.getDataRegistro().format(dtf))
                    .descricao("Entrada Avulsa")
                    .valor(e.getValor())
                    .tipo("entrada")
                    .categoria(e.getFormaPagamento())
                    .build());
        }

        // Adiciona Saídas de Caixa
        List<SaidaCaixa> listSai = saidaRepo.listarPorMes(ano, mes);
        for (SaidaCaixa s : listSai) {
            extrato.add(ExtratoItemDTO.builder()
                    .id(s.getId())
                    .dataOrdenacao(s.getDataRegistro())
                    .data(s.getDataRegistro().format(dtf))
                    .descricao(s.getDescricao())
                    .valor(s.getValor())
                    .tipo("saida_caixa")
                    .categoria(s.getFormaPagamento())
                    .build());
        }

        // Adiciona Boletos Pagos
        List<Financeiro> listFin = financeiroRepo.listarPagosPorMes(ano, mes);
        for (Financeiro f : listFin) {
            extrato.add(ExtratoItemDTO.builder()
                    .id(f.getId()) // ID 0 no python, mas aqui podemos manter o ID real
                    .dataOrdenacao(f.getVencimento())
                    .data(f.getVencimento().format(dtf))
                    .descricao(f.getDescricao())
                    .valor(f.getValor())
                    .tipo("saida_boleto")
                    .categoria("Conta Paga")
                    .build());
        }

        // Ordenação por data (descendente)
        extrato.sort((a, b) -> b.getDataOrdenacao().compareTo(a.getDataOrdenacao()));

        resumo.put("extrato", extrato);
        return resumo;
    }

    // --- MÉTODOS DE CAIXA (Escrita) ---

    @Transactional
    public void adicionarEntrada(String user, EntradaCaixa entrada) {
        entrada.setUsuario(user);
        entradaRepo.save(entrada);
        usuarioService.registrarLog(user, "Entrada Caixa", "R$ " + entrada.getValor());
    }

    @Transactional
    public void adicionarSaidaCaixa(String user, SaidaCaixa saida) {
        saida.setUsuario(user);
        saidaRepo.save(saida);
        usuarioService.registrarLog(user, "Saída Caixa", "R$ " + saida.getValor());
    }

    // --- FORNECEDORES ---

    public List<Fornecedor> listarFornecedores() {
        return fornecedorRepo.findAllByOrderByNomeAsc();
    }

    @Transactional
    public String adicionarFornecedor(String user, String nome, String categoria) {
        if (fornecedorRepo.existsByNome(nome)) {
            return "Fornecedor já cadastrado.";
        }
        Fornecedor f = new Fornecedor();
        f.setNome(nome);
        f.setCategoriaPadrao(categoria);
        f.setUsuarioCriacao(user);
        fornecedorRepo.save(f);
        usuarioService.registrarLog(user, "Configuração", "Cadastrou fornecedor: " + nome);
        return "Sucesso";
    }
}