package com.farmacia.service;

import com.farmacia.model.Financeiro;
import com.farmacia.repository.FinanceiroRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {

    @Autowired private FinanceiroRepository financeiroRepository;

    public Map<String, Object> calcularCardsDashboard(List<Financeiro> registros) {
        LocalDate hoje = LocalDate.now();
        LocalDate daqui7Dias = hoje.plusDays(7);

        // Filtros em memória (Streams) substituindo Pandas boolean masks
        BigDecimal pagarMes = registros.stream()
                .filter(r -> "Pendente".equals(r.getStatus()) && r.getVencimento() != null)
                .map(Financeiro::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal pagoMes = registros.stream()
                .filter(r -> "Pago".equals(r.getStatus()) && r.getVencimento() != null &&
                        r.getVencimento().getMonth() == hoje.getMonth() &&
                        r.getVencimento().getYear() == hoje.getYear())
                .map(Financeiro::getValor)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Financeiro> vencidos = registros.stream()
                .filter(r -> "Pendente".equals(r.getStatus()) && r.getVencimento() != null && r.getVencimento().isBefore(hoje))
                .toList();

        List<Financeiro> proximos = registros.stream()
                .filter(r -> "Pendente".equals(r.getStatus()) && r.getVencimento() != null &&
                        !r.getVencimento().isBefore(hoje) && !r.getVencimento().isAfter(daqui7Dias))
                .toList();

        Map<String, Object> cards = new HashMap<>();
        cards.put("pagar_mes", pagarMes);
        cards.put("pago_mes", pagoMes);
        cards.put("vencidos_val", vencidos.stream().map(Financeiro::getValor).reduce(BigDecimal.ZERO, BigDecimal::add));
        cards.put("vencidos_qtd", vencidos.size());
        cards.put("proximos_val", proximos.stream().map(Financeiro::getValor).reduce(BigDecimal.ZERO, BigDecimal::add));
        cards.put("proximos_qtd", proximos.size());

        return cards;
    }

    public Map<String, Object> gerarDadosGraficos(List<Financeiro> registros, String periodo) {
        LocalDate hoje = LocalDate.now();
        LocalDate dataInicio;

        // Lógica de período do analytics.py
        if ("7d".equals(periodo)) dataInicio = hoje.minusDays(7);
        else if ("30d".equals(periodo)) dataInicio = hoje.minusDays(30);
        else if ("3m".equals(periodo)) dataInicio = hoje.minusDays(90);
        else if ("1y".equals(periodo)) dataInicio = hoje.minusDays(365);
        else dataInicio = LocalDate.MIN; // 'all'

        List<Financeiro> filtrados = registros.stream()
                .filter(r -> r.getVencimento() != null && !r.getVencimento().isBefore(dataInicio))
                .toList();

        // 1. Gráfico Temporal (Por Mês)
        Map<String, BigDecimal> agrupadoPorMes = filtrados.stream()
                .collect(Collectors.groupingBy(
                        r -> r.getVencimento().format(DateTimeFormatter.ofPattern("MM/yyyy")),
                        TreeMap::new, // Tenta manter ordem (precisa de ajuste fino pra ordem cronológica perfeita)
                        Collectors.reducing(BigDecimal.ZERO, Financeiro::getValor, BigDecimal::add)
                ));

        // Ajuste para lista de objetos pro ChartJS
        List<Map<String, Object>> graficoMes = new ArrayList<>();
        agrupadoPorMes.forEach((mes, total) -> {
            Map<String, Object> item = new HashMap<>();
            item.put("mes", mes);
            item.put("total", total);
            graficoMes.add(item);
        });

        // 2. Gráfico Categorias
        Map<String, BigDecimal> agrupadoPorCat = filtrados.stream()
                .collect(Collectors.groupingBy(
                        r -> r.getCategoria() != null ? r.getCategoria() : "Outros",
                        Collectors.reducing(BigDecimal.ZERO, Financeiro::getValor, BigDecimal::add)
                ));

        List<Map<String, Object>> graficoCat = new ArrayList<>();
        agrupadoPorCat.forEach((cat, total) -> {
            Map<String, Object> item = new HashMap<>();
            item.put("categoria", cat);
            item.put("total", total);
            graficoCat.add(item);
        });

        Map<String, Object> resp = new HashMap<>();
        resp.put("por_mes", graficoMes);
        resp.put("por_categoria", graficoCat);
        return resp;
    }

    public List<Map<String, Object>> gerarEventosCalendario(List<Financeiro> registros) {
        LocalDate hoje = LocalDate.now();
        return registros.stream()
                .filter(r -> r.getVencimento() != null)
                .map(r -> {
                    String cor = "#f59e0b"; // Amarelo
                    if ("Pago".equals(r.getStatus())) cor = "#10b981"; // Verde
                    else if (r.getVencimento().isBefore(hoje)) cor = "#ef4444"; // Vermelho

                    Map<String, Object> evento = new HashMap<>();
                    evento.put("id", r.getId());
                    evento.put("title", "R$ " + r.getValor() + " - " + r.getDescricao());
                    evento.put("start", r.getVencimento().toString()); // YYYY-MM-DD
                    evento.put("backgroundColor", cor);
                    evento.put("borderColor", cor);
                    evento.put("allDay", true);
                    return evento;
                })
                .collect(Collectors.toList());
    }
}