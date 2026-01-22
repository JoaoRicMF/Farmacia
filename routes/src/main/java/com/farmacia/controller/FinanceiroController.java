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
    @Autowired private FinanceiroRepository financeiroRepository; // Acesso direto para listas simples
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

        // Paginação do Spring é base 0, o front envia base 1
        Page<Financeiro> page = financeiroService.listarRegistros(
                busca, status, categoria,
                PageRequest.of(pagina - 1, 10, Sort.by(Sort.Direction.DESC, "id"))
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
        String codigo = payload.get("codigo");
        BoletoUtils.DadosBoleto dados = boletoUtils.decifrarBoleto(codigo);
        return ResponseEntity.ok(dados);
    }

    // --- FLUXO ---

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

    // --- EXPORTAÇÃO (CSV Simples) ---

    @GetMapping("/api/exportar")
    public void exportarCsv(HttpServletResponse response, HttpSession session) throws IOException {
        if (session.getAttribute("usuario") == null) {
            response.sendError(403);
            return;
        }

        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"dados.csv\"");

        List<Financeiro> all = financeiroRepository.findAll();
        try (PrintWriter writer = response.getWriter()) {
            writer.println("ID;Descricao;Valor;Vencimento;Status;Categoria");
            for (Financeiro f : all) {
                writer.printf("%d;%s;%s;%s;%s;%s%n",
                        f.getId(), f.getDescricao(), f.getValor(), f.getVencimento(), f.getStatus(), f.getCategoria());
            }
        }
    }

    // Implementar exportar_fluxo_excel usando Apache POI seria similar,
    // mas por brevidade segue a lógica do controller
}