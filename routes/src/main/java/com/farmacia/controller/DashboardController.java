// src/main/java/com/farmacia/controller/DashboardController.java
package com.farmacia.controller;

import com.farmacia.model.Financeiro;
import com.farmacia.repository.FinanceiroRepository;
import com.farmacia.service.AnalyticsService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class DashboardController {

    @Autowired private AnalyticsService analyticsService;
    @Autowired private FinanceiroRepository financeiroRepository;

    @GetMapping("/api/dashboard")
    public ResponseEntity<?> getDashboard(@RequestParam(defaultValue = "7d") String periodo, HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();

        // Carrega todos (em produção idealmente faríamos filtros no DB,
        // mas para manter a lógica do analytics.py original de filtrar em memória):
        List<Financeiro> registros = financeiroRepository.findAll();

        Map<String, Object> response = new HashMap<>();
        response.put("cards", analyticsService.calcularCardsDashboard(registros));
        response.put("graficos", analyticsService.gerarDadosGraficos(registros, periodo));

        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/calendario")
    public ResponseEntity<?> getCalendario(HttpSession session) {
        if (session.getAttribute("usuario") == null) return ResponseEntity.status(403).build();

        List<Financeiro> registros = financeiroRepository.findAll();
        return ResponseEntity.ok(analyticsService.gerarEventosCalendario(registros));
    }
}