package com.farmacia.controller;

import com.farmacia.model.*;
import com.farmacia.repository.FinanceiroRepository;
import com.farmacia.service.BoletoUtils;
import com.farmacia.service.FinanceiroService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.HashMap;
import java.util.Map;

@RestController
public class FinanceiroController {

    @Autowired private FinanceiroService financeiroService;
    @Autowired private FinanceiroRepository financeiroRepository;
    @Autowired private BoletoUtils boletoUtils;

    // Método auxiliar para pegar o usuário logado de forma segura
    private String getUsuarioLogado() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    // Método auxiliar para verificar se é Admin
    private boolean isAdmin() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_Admin") || a.getAuthority().equals("Admin"));
    }

    // --- CRUD ---

    @GetMapping("/api/registros")
    public ResponseEntity<?> listarRegistros(
            @RequestParam(defaultValue = "1") int pagina,
            @RequestParam(required = false) String busca,
            @RequestParam(defaultValue = "Todos") String status,
            @RequestParam(defaultValue = "Todas") String categoria) {

        // Não precisa verificar sessão manual, o Spring Security já garante que está logado

        Page<Financeiro> page = financeiroService.listarRegistros(
                busca, status, categoria,
                PageRequest.of(pagina - 1, 10, Sort.by(Sort.Direction.DESC, "vencimento"))
        );

        Map<String, Object> response = new HashMap<>();
        response.put("registros", page.getContent());
        response.put("total_paginas", page.getTotalPages());
        response.put("pagina_atual", pagina);
        response.put("perm_excluir", isAdmin());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/novo_boleto")
    public ResponseEntity<?> novoBoleto(@RequestBody Financeiro financeiro) {
        financeiroService.adicionarRegistro(getUsuarioLogado(), financeiro);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/ler_codigo")
    public ResponseEntity<?> lerCodigo(@RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(boletoUtils.decifrarBoleto(payload.get("codigo")));
    }

    @PostMapping("/api/editar")
    public ResponseEntity<?> editarRegistro(@RequestBody Financeiro financeiro) {
        financeiroService.editarRegistro(getUsuarioLogado(), financeiro.getId(), financeiro);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir")
    public ResponseEntity<?> excluirRegistro(@RequestBody Map<String, Integer> payload) {
        if (!isAdmin()) return ResponseEntity.status(403).build();

        financeiroService.excluirRegistro(getUsuarioLogado(), payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/atualizar_status")
    public ResponseEntity<?> atualizarStatus(@RequestBody Map<String, Object> payload) {
        financeiroService.atualizarStatus(getUsuarioLogado(), (Integer) payload.get("id"), (String) payload.get("status"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- DASHBOARD & CALENDÁRIO ---

    @GetMapping("/api/dashboard")
    public ResponseEntity<?> getDashboard(@RequestParam(defaultValue = "30d") String periodo) {
        return ResponseEntity.ok(financeiroService.obterDadosDashboard(periodo));
    }

    @GetMapping("/api/calendario")
    public ResponseEntity<?> getCalendario() {
        return ResponseEntity.ok(financeiroService.obterEventosCalendario());
    }

    @PostMapping("/api/detalhes_card")
    public ResponseEntity<?> getDetalhesCard(@RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(financeiroService.listarDetalhesCard(payload.get("tipo")));
    }

    // --- FLUXO DE CAIXA ---

    @GetMapping("/api/fluxo_resumo")
    public ResponseEntity<?> fluxoResumo(@RequestParam int mes, @RequestParam int ano) {
        return ResponseEntity.ok(financeiroService.obterResumoFluxo(mes, ano));
    }

    @PostMapping("/api/nova_entrada")
    public ResponseEntity<?> novaEntrada(@RequestBody EntradaCaixa entrada) {
        financeiroService.adicionarEntrada(getUsuarioLogado(), entrada);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/nova_saida_caixa")
    public ResponseEntity<?> novaSaidaCaixa(@RequestBody SaidaCaixa saida) {
        financeiroService.adicionarSaidaCaixa(getUsuarioLogado(), saida);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir_entrada")
    public ResponseEntity<?> excluirEntrada(@RequestBody Map<String, Integer> payload) {
        if (!isAdmin()) return ResponseEntity.status(403).build();

        financeiroService.excluirEntrada(getUsuarioLogado(), payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir_saida_caixa")
    public ResponseEntity<?> excluirSaidaCaixa(@RequestBody Map<String, Integer> payload) {
        if (!isAdmin()) return ResponseEntity.status(403).build();

        financeiroService.excluirSaidaCaixa(getUsuarioLogado(), payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- FORNECEDORES ---

    @GetMapping("/api/fornecedores")
    public ResponseEntity<?> listarFornecedores() {
        return ResponseEntity.ok(financeiroService.listarFornecedores());
    }

    @PostMapping("/api/novo_fornecedor")
    public ResponseEntity<?> novoFornecedor(@RequestBody Fornecedor fornecedor) {
        String result = financeiroService.adicionarFornecedor(getUsuarioLogado(), fornecedor.getNome(), fornecedor.getCategoriaPadrao());
        if ("Sucesso".equals(result)) return ResponseEntity.ok(Map.of("success", true));
        return ResponseEntity.badRequest().body(Map.of("success", false, "message", result));
    }

    @PostMapping("/api/excluir_fornecedor")
    public ResponseEntity<?> excluirFornecedor(@RequestBody Map<String, Integer> payload) {
        financeiroService.excluirFornecedor(getUsuarioLogado(), payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- EXPORTAÇÃO ---

    @GetMapping("/api/exportar")
    public void exportarCsv(HttpServletResponse response) throws IOException {
        // Verifica autenticação
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            response.sendError(403);
            return;
        }

        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"dados.csv\"");
        try (PrintWriter writer = response.getWriter()) {
            writer.println("ID;Descricao;Valor;Vencimento;Status;Categoria");
            for (Financeiro f : financeiroRepository.findAll()) {
                writer.printf("%d;%s;%s;%s;%s;%s%n", f.getId(), f.getDescricao(), f.getValor(), f.getVencimento(), f.getStatus(), f.getCategoria());
            }
        }
    }
}