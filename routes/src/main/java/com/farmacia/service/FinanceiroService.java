package com.farmacia.service;

import com.farmacia.dto.ExtratoItemDTO;
import com.farmacia.model.EntradaCaixa;
import com.farmacia.model.Financeiro;
import com.farmacia.model.SaidaCaixa;
import com.farmacia.repository.EntradaCaixaRepository;
import com.farmacia.repository.FinanceiroRepository;
import com.farmacia.repository.SaidaCaixaRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class FinanceiroService {

    @Autowired
    private FinanceiroRepository financeiroRepository;

    @Autowired
    private EntradaCaixaRepository entradaRepository;

    @Autowired
    private SaidaCaixaRepository saidaRepository;

    // --- CONTAS A PAGAR/RECEBER (Financeiro) ---

    public List<Financeiro> listarTodos() {
        return financeiroRepository.findAll();
    }

    public Financeiro salvar(Financeiro dados) {
        // Se for edição, mantém o ID
        Financeiro financeiro = new Financeiro();

        if (dados.getId() != null) {
            financeiro = financeiroRepository.findById(dados.getId()).orElse(new Financeiro());
        }

        financeiro.setDescricao(dados.getDescricao());
        financeiro.setValor(dados.getValor());
        financeiro.setVencimento(dados.getVencimento());
        financeiro.setCategoria(dados.getCategoria());
        financeiro.setStatus(dados.getStatus() != null ? dados.getStatus() : "Pendente");
        financeiro.setCodigoBarras(dados.getCodigoBarras());

        // Se marcou como pago agora, registra a data de processamento
        if ("Pago".equalsIgnoreCase(financeiro.getStatus()) && financeiro.getDataProcessamento() == null) {
            financeiro.setDataProcessamento(LocalDateTime.now());
        }

        return financeiroRepository.save(financeiro);
    }

    public void excluir(Integer id) {
        financeiroRepository.deleteById(id);
    }

    public void marcarComoPago(Integer id) {
        Financeiro conta = financeiroRepository.findById(id).orElseThrow();
        conta.setStatus("Pago");
        conta.setDataProcessamento(LocalDateTime.now());
        financeiroRepository.save(conta);
    }

    // --- CAIXA (Entradas e Saídas do Dia a Dia) ---

    public EntradaCaixa registrarEntrada(EntradaCaixa entrada, String usuarioLogado) {
        entrada.setDataRegistro(LocalDate.now());
        entrada.setUsuario(usuarioLogado); // Garante que o usuário venha do login
        return entradaRepository.save(entrada);
    }

    public SaidaCaixa registrarSaida(SaidaCaixa saida, String usuarioLogado) {
        saida.setDataRegistro(LocalDate.now());
        saida.setUsuario(usuarioLogado); // Garante que o usuário venha do login
        return saidaRepository.save(saida);
    }

    // --- RELATÓRIOS E EXTRATOS ---

    public Map<String, BigDecimal> calcularTotalizadores() {
        // 1. Total de Entradas (Vendas/Caixa)
        BigDecimal totalEntradas = entradaRepository.findAll().stream()
                .map(EntradaCaixa::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 2. Total de Saídas (Sangrias/Despesas de Caixa)
        BigDecimal totalSaidas = saidaRepository.findAll().stream()
                .map(SaidaCaixa::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 3. Contas Pagas (Boletos/Fornecedores)
        BigDecimal contasPagas = financeiroRepository.findAll().stream()
                .filter(f -> "Pago".equalsIgnoreCase(f.getStatus()))
                .map(Financeiro::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 4. Contas Pendentes (Futuras)
        BigDecimal contasPendentes = financeiroRepository.findAll().stream()
                .filter(f -> !"Pago".equalsIgnoreCase(f.getStatus()))
                .map(Financeiro::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Saldo Atual = Entradas - (Saídas do Caixa + Contas Pagas)
        BigDecimal saldoAtual = totalEntradas.subtract(totalSaidas).subtract(contasPagas);

        return Map.of(
                "saldoAtual", saldoAtual,
                "contasPendentes", contasPendentes,
                "totalEntradas", totalEntradas,
                "totalSaidas", totalSaidas.add(contasPagas) // Soma saídas de caixa e contas pagas
        );
    }

    public List<ExtratoItemDTO> gerarExtratoUnificado() {
        List<ExtratoItemDTO> extrato = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");

        // 1. Adiciona Entradas de Caixa
        List<EntradaCaixa> entradas = entradaRepository.findAll();
        for (EntradaCaixa e : entradas) {
            extrato.add(ExtratoItemDTO.builder()
                    .id(e.getId())
                    .dataOrdenacao(e.getDataRegistro())
                    .data(e.getDataRegistro() != null ? e.getDataRegistro().format(formatter) : "")
                    .descricao("Entrada de Caixa (" + e.getFormaPagamento() + ")")
                    .valor(e.getValor())
                    .tipo("entrada")
                    .categoria("Vendas/Caixa")
                    .build());
        }

        // 2. Adiciona Saídas de Caixa
        List<SaidaCaixa> saidas = saidaRepository.findAll();
        for (SaidaCaixa s : saidas) {
            extrato.add(ExtratoItemDTO.builder()
                    .id(s.getId())
                    .dataOrdenacao(s.getDataRegistro())
                    .data(s.getDataRegistro() != null ? s.getDataRegistro().format(formatter) : "")
                    .descricao(s.getDescricao() != null ? s.getDescricao() : "Saída de Caixa")
                    .valor(s.getValor())
                    .tipo("saida_caixa")
                    .categoria("Despesa/Sangria")
                    .build());
        }

        // 3. Adiciona Contas Pagas (Financeiro)
        List<Financeiro> contas = financeiroRepository.findAll();
        for (Financeiro f : contas) {
            if ("Pago".equalsIgnoreCase(f.getStatus())) {
                LocalDate dataPagamento = f.getDataProcessamento() != null
                        ? f.getDataProcessamento().toLocalDate()
                        : f.getVencimento(); // Fallback se não tiver data de proc.

                extrato.add(ExtratoItemDTO.builder()
                        .id(f.getId())
                        .dataOrdenacao(dataPagamento)
                        .data(dataPagamento != null ? dataPagamento.format(formatter) : "")
                        .descricao(f.getDescricao())
                        .valor(f.getValor())
                        .tipo("saida_boleto")
                        .categoria(f.getCategoria())
                        .build());
            }
        }

        // Ordena tudo por data (mais recente primeiro)
        return extrato.stream()
                .sorted(Comparator.comparing(ExtratoItemDTO::getDataOrdenacao, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }
}