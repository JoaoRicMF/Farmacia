package com.farmacia.controller;

import com.farmacia.model.*;
import com.farmacia.repository.FinanceiroRepository;
import com.farmacia.service.BoletoUtils;
import com.farmacia.service.FinanceiroService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class FinanceiroController {

    @Autowired private FinanceiroService financeiroService;
    @Autowired private FinanceiroRepository financeiroRepository;
    @Autowired private BoletoUtils boletoUtils;

    // --- CRUD ---

    @GetMapping("/api/registros")
    public ResponseEntity<?> listarRegistros(
            @RequestParam(defaultValue = "1") int pagina,
            @RequestParam(required = false) String busca,
            @RequestParam(defaultValue = "Todos") String status,
            @RequestParam(defaultValue = "Todas") String categoria,
            HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();

        Page<Financeiro> page = financeiroService.listarRegistros(
                busca, status, categoria,
                PageRequest.of(pagina - 1, 10, Sort.by(Sort.Direction.DESC, "vencimento"))
        );

        Map<String, Object> response = new HashMap<>();
        response.put("registros", page.getContent());
        response.put("total_paginas", page.getTotalPages());
        response.put("pagina_atual", pagina);
        response.put("perm_excluir", "Admin".equals(session.getAttribute("funcao")));

        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/novo_boleto")
    public ResponseEntity<?> novoBoleto(@RequestBody Financeiro financeiro, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.adicionarRegistro(user, financeiro);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/ler_codigo")
    public ResponseEntity<?> lerCodigo(@RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(boletoUtils.decifrarBoleto(payload.get("codigo")));
    }

    @PostMapping("/api/editar")
    public ResponseEntity<?> editarRegistro(@RequestBody Financeiro financeiro, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.editarRegistro(user, financeiro.getId(), financeiro);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir")
    public ResponseEntity<?> excluirRegistro(@RequestBody Map<String, Integer> payload, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null || !"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        financeiroService.excluirRegistro(user, payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/atualizar_status")
    public ResponseEntity<?> atualizarStatus(@RequestBody Map<String, Object> payload, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.atualizarStatus(user, (Integer) payload.get("id"), (String) payload.get("status"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- DASHBOARD & CALENDÁRIO ---

    @GetMapping("/api/dashboard")
    public ResponseEntity<?> getDashboard(@RequestParam(defaultValue = "30d") String periodo, HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(financeiroService.obterDadosDashboard(periodo));
    }

    @GetMapping("/api/calendario")
    public ResponseEntity<?> getCalendario(HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(financeiroService.obterEventosCalendario());
    }

    @PostMapping("/api/detalhes_card")
    public ResponseEntity<?> getDetalhesCard(@RequestBody Map<String, String> payload, HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(financeiroService.listarDetalhesCard(payload.get("tipo")));
    }

    // --- FLUXO DE CAIXA ---

    @GetMapping("/api/fluxo_resumo")
    public ResponseEntity<?> fluxoResumo(@RequestParam int mes, @RequestParam int ano, HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(financeiroService.obterResumoFluxo(mes, ano));
    }

    @PostMapping("/api/nova_entrada")
    public ResponseEntity<?> novaEntrada(@RequestBody EntradaCaixa entrada, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.adicionarEntrada(user, entrada);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/nova_saida_caixa")
    public ResponseEntity<?> novaSaidaCaixa(@RequestBody SaidaCaixa saida, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.adicionarSaidaCaixa(user, saida);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir_entrada")
    public ResponseEntity<?> excluirEntrada(@RequestBody Map<String, Integer> payload, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null || !"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        financeiroService.excluirEntrada(user, payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/api/excluir_saida_caixa")
    public ResponseEntity<?> excluirSaidaCaixa(@RequestBody Map<String, Integer> payload, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null || !"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        financeiroService.excluirSaidaCaixa(user, payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- FORNECEDORES ---

    @GetMapping("/api/fornecedores")
    public ResponseEntity<?> listarFornecedores() {
        return ResponseEntity.ok(financeiroService.listarFornecedores());
    }

    @PostMapping("/api/novo_fornecedor")
    public ResponseEntity<?> novoFornecedor(@RequestBody Fornecedor fornecedor, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        String result = financeiroService.adicionarFornecedor(user, fornecedor.getNome(), fornecedor.getCategoriaPadrao());
        if ("Sucesso".equals(result)) return ResponseEntity.ok(Map.of("success", true));
        return ResponseEntity.badRequest().body(Map.of("success", false, "message", result));
    }

    @PostMapping("/api/excluir_fornecedor")
    public ResponseEntity<?> excluirFornecedor(@RequestBody Map<String, Integer> payload, HttpSession session) {
        String user = (String) session.getAttribute("usuario");
        if (user == null) return ResponseEntity.status(403).build();
        financeiroService.excluirFornecedor(user, payload.get("id"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    // --- EXPORTAÇÃO ---

    @GetMapping("/api/exportar")
    public void exportarCsv(HttpServletResponse response, HttpSession session) throws IOException {
        if (session.getAttribute("usuario") == null) { response.sendError(403); return; }
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