package com.farmacia.controller;

import com.farmacia.dto.ExtratoItemDTO;
import com.farmacia.model.EntradaCaixa;
import com.farmacia.model.Financeiro;
import com.farmacia.model.SaidaCaixa;
import com.farmacia.service.FinanceiroService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/financeiro")
public class FinanceiroController {

    @Autowired
    private FinanceiroService financeiroService;

    // --- CRUD DE CONTAS (Boleto/Fornecedor) ---

    @GetMapping
    public List<Financeiro> listar() {
        return financeiroService.listarTodos();
    }

    @PostMapping
    public ResponseEntity<Financeiro> salvar(@RequestBody Financeiro financeiro) {
        return ResponseEntity.ok(financeiroService.salvar(financeiro));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable Integer id) {
        financeiroService.excluir(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/pagar")
    public ResponseEntity<Void> marcarComoPago(@PathVariable Integer id) {
        financeiroService.marcarComoPago(id);
        return ResponseEntity.ok().build();
    }

    // --- OPERAÇÕES DE CAIXA ---

    @PostMapping("/entrada")
    public ResponseEntity<EntradaCaixa> registrarEntrada(@RequestBody EntradaCaixa entrada) {
        String usuario = getUsuarioLogado();
        return ResponseEntity.ok(financeiroService.registrarEntrada(entrada, usuario));
    }

    @PostMapping("/saida")
    public ResponseEntity<SaidaCaixa> registrarSaida(@RequestBody SaidaCaixa saida) {
        String usuario = getUsuarioLogado();
        return ResponseEntity.ok(financeiroService.registrarSaida(saida, usuario));
    }

    // --- DASHBOARD E RELATÓRIOS ---

    @GetMapping("/totalizadores")
    public ResponseEntity<Map<String, BigDecimal>> getTotalizadores() {
        return ResponseEntity.ok(financeiroService.calcularTotalizadores());
    }

    @GetMapping("/extrato")
    public ResponseEntity<List<ExtratoItemDTO>> getExtrato() {
        return ResponseEntity.ok(financeiroService.gerarExtratoUnificado());
    }

    // Método auxiliar para pegar o nome do usuário logado
    private String getUsuarioLogado() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null) {
            return auth.getName();
        }
        return "Sistema";
    }
}