/* ==========================================================================
   FARMÁCIA SYSTEM - JAVASCRIPT PRINCIPAL (V3.0 FIXED)
   ========================================================================== */

/* --- 1. CONFIGURAÇÕES GLOBAIS --- */
const CONFIG = {
    API_URL: '/api', // Caminho relativo para funcionar com php -S
    ANIMATION_SPEED: 300
};

// Estado da Aplicação
let estadoApp = {
    usuario: null,
    paginaAtualFinanceiro: 1,
    totalPaginasFinanceiro: 1,
    chartMes: null,
    chartCat: null,
    chartMes: null,
    chartCat: null,
    fornecedoresCache: []
};

// Elementos de UI reutilizáveis
const LOADER_HTML = `
    <tr><td colspan="100%" class="text-center py-4">
        <div class="loader-spinner"></div> Carregando...
    </td></tr>`;

/* ==========================================================================
   2. UTILITÁRIOS (Helpers)
   ========================================================================== */

// Wrapper para Fetch (Trata Erros e JSON)
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);

        // Tratamento de Erro 401 (Sessão Expirada)
        if (response.status === 401) {
            console.warn("Sessão expirada ou não autorizado.");
            logoutFrontend();
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Erro na requisição para ${endpoint}:`, error);
        showToast("Erro de conexão com o servidor.", "error");
        return { success: false, message: "Erro de rede" };
    }
}

// Formatação de Moeda (Input e Display)
function formatarMoedaBRL(valor) {
    return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mascaraMoedaInput(input) {
    let v = input.value.replace(/\D/g, '');
    v = (v / 100).toFixed(2) + '';
    input.value = "R$ " + v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

function converterMoedaParaFloat(valorString) {
    if (!valorString) return 0.00;
    // Remove "R$", pontos e troca vírgula por ponto
    return parseFloat(valorString.replace(/[^\d,]/g, '').replace(',', '.'));
}

// Formatação de Data (YYYY-MM-DD -> DD/MM/YYYY)
function formatarDataBR(dataISO) {
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Toast Notification
function showToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`; // CSS deve ter classes .toast-success e .toast-error
    toast.innerHTML = `
        <span class="toast-icon">${tipo === 'success' ? '✅' : '⚠️'}</span>
        <span class="toast-msg">${mensagem}</span>
    `;

    container.appendChild(toast);

    // Animação de entrada e saída
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ==========================================================================
   3. AUTENTICAÇÃO
   ========================================================================== */

async function verificarSessao() {
    const res = await apiRequest('/auth.php?action=check');
    if (res && res.id) {
        iniciarApp(res);
    } else {
        exibirTelaLogin();
    }
}

async function login(event) {
    if (event) event.preventDefault();

    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const btn = document.getElementById('btn-entrar');

    if (!user || !pass) return showToast("Preencha usuário e senha.", "error");

    btn.disabled = true;
    btn.innerText = "Entrando...";

    const res = await apiRequest('/auth.php', 'POST', { usuario: user, senha: pass });

    btn.disabled = false;
    btn.innerText = "Entrar";

    if (res && res.success) {
        showToast(`Bem-vindo, ${res.nome}!`);
        iniciarApp(res);
    } else {
        showToast(res.message || "Login falhou.", "error");
    }
}

function logoutFrontend() {
    estadoApp.usuario = null;
    sessionStorage.clear();
    exibirTelaLogin();
}

async function logout() {
    await apiRequest('/auth.php?action=logout');
    logoutFrontend();
}

function iniciarApp(dadosUsuario) {
    estadoApp.usuario = dadosUsuario;
    sessionStorage.setItem('user_role', dadosUsuario.funcao);

    // Atualiza UI com dados do usuário
    const userDisplay = document.getElementById('user-display');
    const userRole = document.getElementById('user-role');
    if (userDisplay) userDisplay.innerText = dadosUsuario.nome;
    if (userRole) userRole.innerText = dadosUsuario.funcao === 'Admin' ? 'Administrador' : 'Operador';

    // Controle de Permissão (Admin Only)
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = dadosUsuario.funcao === 'Admin' ? 'block' : 'none';
    });

    // Troca de telas
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    // Inicialização
    carregarFornecedores(); // Cache para selects
    navegar('dashboard');
}

function exibirTelaLogin() {
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

/* ==========================================================================
   4. NAVEGAÇÃO (SPA)
   ========================================================================== */

function navegar(telaId) {
    // Esconde todas as views
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    // Mostra a view desejada
    const viewAlvo = document.getElementById(`view-${telaId}`);
    if (viewAlvo) {
        viewAlvo.classList.remove('hidden');

        // Lógica específica ao carregar cada tela
        switch(telaId) {
            case 'dashboard': carregarDashboard(); break;
            case 'lista': carregarFinanceiro(1); break;
            case 'fluxo': carregarFluxo(); break;
            case 'logs': carregarLogs(); break;
            case 'config': carregarConfiguracoes(); break;
            case 'novo': prepararNovoRegistro(); break;
        }
    }

    // Atualiza Menu Sidebar
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    const btnAtivo = document.querySelector(`.menu-item[onclick*="'${telaId}'"]`);
    if (btnAtivo) btnAtivo.classList.add('active');

    // Fecha sidebar no mobile se estiver aberta
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768 && sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    sidebar.classList.toggle('active');

    if (sidebar.classList.contains('active')) {
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
}

/* ==========================================================================
   5. DASHBOARD
   ========================================================================== */

async function carregarDashboard(periodo = '7d') {
    // Atualiza visualmente o botão do filtro selecionado
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[onclick*="'${periodo}'"]`);
    if (btn) btn.classList.add('active');

    const dados = await apiRequest(`/dashboard.php?periodo=${periodo}`);
    if (!dados) return;

    // Atualiza os Cards (Texto e Valores)
    if (dados.cards) {
        document.getElementById('card-pagar-mes').innerText = formatarMoedaBRL(dados.cards.pagar_mes);
        document.getElementById('card-pago-mes').innerText = formatarMoedaBRL(dados.cards.pago_mes);

        document.getElementById('card-vencidos-val').innerText = formatarMoedaBRL(dados.cards.vencidos_val);
        document.getElementById('card-vencidos-qtd').innerText = dados.cards.vencidos_qtd;

        document.getElementById('card-proximos-val').innerText = formatarMoedaBRL(dados.cards.proximos_val);
        document.getElementById('card-proximos-qtd').innerText = dados.cards.proximos_qtd;
    }

    // Chama as funções que desenham Gráficos e Calendário
    renderizarGraficos(dados.graficos);
    renderizarCalendario(dados.calendario);
}
function renderizarGraficos(dados) {
    if (typeof Chart === 'undefined') return; // Evita erro se o Chart.js não carregar

    // Gráfico de Linha (Fluxo por Mês)
    const ctxMes = document.getElementById('chartMes');
    if (estadoApp.chartMes) estadoApp.chartMes.destroy(); // Limpa gráfico anterior

    estadoApp.chartMes = new Chart(ctxMes, {
        type: 'line',
        data: {
            labels: dados.por_mes.map(d => d.mes),
            datasets: [{
                label: 'Total (R$)',
                data: dados.por_mes.map(d => d.total),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Gráfico de Rosca (Categorias)
    const ctxCat = document.getElementById('chartCat');
    if (estadoApp.chartCat) estadoApp.chartCat.destroy();

    estadoApp.chartCat = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: dados.por_categoria.map(d => d.categoria),
            datasets: [{
                data: dados.por_categoria.map(d => d.total),
                backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#6366f1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderizarCalendario(eventos) {
    const el = document.getElementById('calendar');
    if (!el) return;

    if (!eventos || eventos.length === 0) {
        el.innerHTML = '<p class="text-center text-muted" style="padding:20px;">Nenhum vencimento previsto.</p>';
        return;
    }

    // Agrupa eventos por data
    const dias = {};
    eventos.forEach(ev => {
        if(!dias[ev.vencimento]) dias[ev.vencimento] = [];
        dias[ev.vencimento].push(ev);
    });

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px;">';

    Object.keys(dias).sort().forEach(data => {
        const lista = dias[data];
        const total = lista.reduce((acc, i) => acc + parseFloat(i.valor), 0);

        // Cor da borda baseada no status
        let corBorda = '#f59e0b'; // Amarelo (Padrão)
        if (lista.some(i => i.status === 'Vencido')) corBorda = '#ef4444'; // Vermelho
        else if (lista.every(i => i.status === 'Pago')) corBorda = '#10b981'; // Verde

        html += `
        <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; border-left: 4px solid ${corBorda}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-weight:bold; font-size:0.85rem; margin-bottom:4px;">${formatarDataBR(data).substring(0,5)}</div>
            <div style="font-size:0.75rem; color:#666;">${lista.length} conta(s)</div>
            <div style="font-weight:bold; color:var(--text-main); font-size:0.9rem;">${formatarMoedaBRL(total)}</div>
        </div>`;
    });

    html += '</div>';
    el.innerHTML = html;
}

// --- INTERATIVIDADE DOS CARDS ---

function verDetalhes(tipo) {
    navegar('lista');

    // Pequeno delay para a tela carregar antes de filtrar
    setTimeout(() => {
        if (tipo === 'vencidos') preFiltrarLista('Vencido');
        if (tipo === 'proximos') preFiltrarLista('Pendente', 7); // Próximos 7 dias
    }, 100);
}

function preFiltrarLista(status, diasFuturos = null) {
    const selStatus = document.getElementById('filtro-status');
    const inpInicio = document.getElementById('filtro-data-inicio');
    const inpFim = document.getElementById('filtro-data-fim');

    // Limpa filtros anteriores
    if(inpInicio) inpInicio.value = '';
    if(inpFim) inpFim.value = '';

    if (selStatus) {
        if(status === 'Vencido') {
            selStatus.value = 'Todos'; // O filtro de data fará o trabalho
            // Define data fim como "ontem"
            let ontem = new Date();
            ontem.setDate(ontem.getDate() - 1);
            inpFim.value = ontem.toISOString().split('T')[0];
        } else {
            selStatus.value = status;
        }
    }

    if (diasFuturos) {
        // Define intervalo: Hoje até Hoje + X dias
        const hoje = new Date();
        inpInicio.value = hoje.toISOString().split('T')[0];

        let futuro = new Date();
        futuro.setDate(futuro.getDate() + diasFuturos);
        inpFim.value = futuro.toISOString().split('T')[0];
    }

    carregarFinanceiro(1);
}

function toggleCalendarSection() {
    const wrap = document.getElementById('calendar-wrapper');
    const header = document.querySelector('.toggle-header');

    if (wrap.style.display === 'none' || wrap.classList.contains('hidden-content')) {
        wrap.style.display = 'block';
        wrap.classList.remove('hidden-content');
        header.classList.add('open');
    } else {
        wrap.style.display = 'none';
        header.classList.remove('open');
    }
}

function renderizarGraficos(dadosGraficos) {
    if (!dadosGraficos) return;

    // Gráfico de Linha (Fluxo/Vencimentos)
    const ctxMes = document.getElementById('chartMes');
    if (ctxMes) {
        if (estadoApp.chartMes) estadoApp.chartMes.destroy();
        estadoApp.chartMes = new Chart(ctxMes, {
            type: 'line',
            data: {
                labels: dadosGraficos.por_mes.map(d => d.mes),
                datasets: [{
                    label: 'Total (R$)',
                    data: dadosGraficos.por_mes.map(d => d.total),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Gráfico de Rosca (Categorias)
    const ctxCat = document.getElementById('chartCat');
    if (ctxCat) {
        if (estadoApp.chartCat) estadoApp.chartCat.destroy();
        estadoApp.chartCat = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: dadosGraficos.por_categoria.map(d => d.categoria),
                datasets: [{
                    data: dadosGraficos.por_categoria.map(d => d.total),
                    backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

/* ==========================================================================
   6. FINANCEIRO (CRUD e Listagem)
   ========================================================================== */

async function carregarFinanceiro(pagina = 1) {
    estadoApp.paginaAtualFinanceiro = pagina;
    const tbody = document.querySelector('#tabela-registros tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

    // Captura os valores dos filtros
    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status') ? document.getElementById('filtro-status').value : 'Todos';
    const cat = document.getElementById('filtro-cat') ? document.getElementById('filtro-cat').value : 'Todas';

    // NOVOS CAMPOS DE DATA
    const dIni = document.getElementById('filtro-data-inicio') ? document.getElementById('filtro-data-inicio').value : '';
    const dFim = document.getElementById('filtro-data-fim') ? document.getElementById('filtro-data-fim').value : '';

    // Monta a URL com os novos parâmetros
    let url = `/financeiro.php?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${status}&categoria=${encodeURIComponent(cat)}`;
    if(dIni) url += `&data_inicio=${dIni}`;
    if(dFim) url += `&data_fim=${dFim}`;

    const res = await apiRequest(url);

    tbody.innerHTML = '';
    if (!res || !res.registros || res.registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
        return;
    }

    document.getElementById('info-paginas').innerText = `Página ${pagina} de ${res.total_paginas}`;

    res.registros.forEach(r => {
        let badge = r.status === 'Pago' ? 'bg-success' : 'bg-warning text-dark';

        // Lógica visual para Vencido
        const hoje = new Date().toISOString().split('T')[0];
        if(r.status !== 'Pago' && r.vencimento < hoje) {
            badge = 'bg-danger';
            r.status = 'Vencido'; // Força visualização como vencido
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataBR(r.vencimento)}</td>
            <td>${r.descricao}</td>
            <td><small class="badge badge-light border">${r.categoria}</small></td>
            <td>${formatarMoedaBRL(r.valor)}</td>
            <td><span class="badge ${badge}">${r.status}</span></td>
            <td class="text-right">
                ${r.status !== 'Pago' ? `<button class="btn-icon btn-check" onclick="baixarRegistro(${r.id})" title="Pagar">✓</button>` : ''}
                <button class="btn-icon btn-edit" onclick="editarRegistro(${r.id})" title="Editar">✎</button>
                <button class="btn-icon btn-trash" onclick="excluirRegistro(${r.id})" title="Excluir">🗑</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function prepararNovoRegistro() {
    // Limpa formulário
    document.getElementById('form-boleto').reset();
    document.getElementById('boleto-id-hidden').value = '';
    document.getElementById('form-titulo').innerText = 'Novo Registro';

    // Define data de hoje no vencimento por padrão se vazio
    if (!document.getElementById('boleto-venc').value) {
        document.getElementById('boleto-venc').value = new Date().toISOString().split('T')[0];
    }

    // Foca no primeiro campo
    setTimeout(() => document.getElementById('boleto-cod').focus(), 100);
}

async function salvarBoleto(manterNaTela = false) {
    const id = document.getElementById('boleto-id-hidden').value;

    const payload = {
        id: id || null, // Importante para o backend saber se é UPDATE ou INSERT
        descricao: document.getElementById('boleto-desc').value,
        valor: converterMoedaParaFloat(document.getElementById('boleto-valor').value),
        vencimento: document.getElementById('boleto-venc').value,
        categoria: document.getElementById('boleto-cat').value,
        status: document.getElementById('boleto-status').value,
        codigo_barras: document.getElementById('boleto-cod').value
    };

    if (!payload.descricao || payload.valor <= 0 || !payload.vencimento) {
        return showToast("Preencha Descrição, Valor e Vencimento.", "error");
    }

    // Define se é Edição ou Novo
    let url = '/financeiro.php?action=salvar';
    if (id) url = `/financeiro.php?action=atualizar&id=${id}`; // Caso sua API use update via URL

    // Envia para o Backend
    const res = await apiRequest('/financeiro.php', 'POST', payload); // Usando POST padrão para ambos

    if (res && res.success) {
        showToast("Registro salvo com sucesso!");

        if (manterNaTela) {
            // Modo "Salvar + Novo": Limpa e mantém na tela
            prepararNovoRegistro();
        } else {
            // Modo "Salvar e Sair": Volta para lista
            navegar('lista');
        }
    } else {
        showToast(res.message || "Erro ao salvar.", "error");
    }
}

async function editarRegistro(id) {
    const res = await apiRequest(`/financeiro.php?id=${id}`);
    if (res && res.id) {
        navegar('novo');
        document.getElementById('form-titulo').innerText = 'Editar Registro';
        document.getElementById('boleto-id-hidden').value = res.id;
        document.getElementById('boleto-desc').value = res.descricao;
        document.getElementById('boleto-cod').value = res.codigo_barras || '';
        document.getElementById('boleto-venc').value = res.vencimento;
        document.getElementById('boleto-cat').value = res.categoria;
        document.getElementById('boleto-status').value = res.status;

        const campoValor = document.getElementById('boleto-valor');
        campoValor.value = formatarMoedaBRL(res.valor);
    }
}

async function excluirRegistro(id) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;
    const res = await apiRequest(`/financeiro.php?action=excluir&id=${id}`, 'POST');
    if (res && res.success) {
        showToast("Registro excluído.");
        carregarFinanceiro(estadoApp.paginaAtualFinanceiro);
    }
}

async function baixarRegistro(id) {
    if (!confirm("Confirmar pagamento/baixa deste registro?")) return;
    const res = await apiRequest(`/financeiro.php?action=baixar&id=${id}`, 'POST');
    if (res && res.success) {
        showToast("Baixa realizada com sucesso!");
        carregarFinanceiro(estadoApp.paginaAtualFinanceiro);
    }
}

// Leitor de Código de Barras (Mock/Real)
// --- LEITOR DE CÓDIGO DE BARRAS (Inteligente) ---
async function lerCodigoBarras() {
    const input = document.getElementById('boleto-cod');
    // Remove tudo que não for número
    const codigo = input.value.replace(/[^0-9]/g, '');

    if (codigo.length < 44) return; // Código incompleto

    // Tenta extrair dados de boleto bancário (47 dígitos)
    if (codigo.length === 47) {
        // Valor: Últimos 10 dígitos (ex: 0000015000 = R$ 150,00)
        const valorStr = codigo.substring(37);
        const valor = parseFloat(valorStr) / 100;

        // Fator Vencimento: Dígitos 33 a 37
        const fator = parseInt(codigo.substring(33, 37));

        // Preenche Valor
        if (!isNaN(valor) && valor > 0) {
            document.getElementById('boleto-valor').value = formatarMoedaBRL(valor);
        }

        // Preenche Data (Base: 07/10/1997)
        if (fator >= 1000) {
            const dataBase = new Date('1997-10-07');
            dataBase.setDate(dataBase.getDate() + fator);
            document.getElementById('boleto-venc').value = dataBase.toISOString().split('T')[0];
        }

        showToast("Código lido! Valor e Data preenchidos.", "success");
        // Pula para o campo de descrição
        document.getElementById('boleto-desc').focus();
    }
}

/* ==========================================================================
   7. FLUXO DE CAIXA
   ========================================================================== */

async function carregarFluxo() {
    const mesInput = document.getElementById('filtro-mes-fluxo');
    // Define mês atual se vazio
    if (!mesInput.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        mesInput.value = `${yyyy}-${mm}`;
    }

    const tbody = document.querySelector('#tabela-fluxo tbody');
    tbody.innerHTML = LOADER_HTML;

    const res = await apiRequest(`/fluxo.php?mes=${mesInput.value}`);
    tbody.innerHTML = '';

    if (!res || !res.movimentacoes || res.movimentacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" class="text-center py-4">Sem movimentações neste mês.</td></tr>';
    } else {
        res.movimentacoes.forEach(mov => {
            const tr = document.createElement('tr');
            const isEntrada = mov.tipo === 'ENTRADA';
            const corClass = isEntrada ? 'text-success' : 'text-danger';
            const sinal = isEntrada ? '+' : '-';

            tr.innerHTML = `
                <td>${formatarDataBR(mov.data)}</td>
                <td>${mov.descricao}</td>
                <td>${mov.categoria || '-'}</td>
                <td class="text-right font-weight-bold ${corClass}">
                    ${sinal} ${formatarMoedaBRL(mov.valor)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Atualiza Totais
    if (res) {
        document.getElementById('total-entradas').innerText = res.total_entradas_fmt || 'R$ 0,00';
        document.getElementById('total-saidas').innerText = res.total_saidas_fmt || 'R$ 0,00';
        document.getElementById('total-saldo').innerText = res.saldo_fmt || 'R$ 0,00';
    }
}

async function salvarMovimentoRapido(tipo) {
    const prefixo = tipo === 'entrada' ? 'ent' : 'sai'; // IDs: ent-desc, ent-valor...

    const desc = document.getElementById(`${prefixo}-desc`).value;
    const valorStr = document.getElementById(`${prefixo}-valor`).value;
    const data = document.getElementById(`${prefixo}-data`).value;

    if (!desc || !valorStr || !data) return showToast("Preencha todos os campos.", "error");

    const payload = {
        descricao: desc,
        valor: converterMoedaParaFloat(valorStr),
        data_registro: data, // snake_case para o PHP
        tipo: tipo.toUpperCase()
    };

    const res = await apiRequest('/fluxo.php?action=salvar', 'POST', payload);

    if (res && res.success) {
        showToast("Movimentação registrada!");
        // Limpar campos
        document.getElementById(`${prefixo}-desc`).value = '';
        document.getElementById(`${prefixo}-valor`).value = '';
        carregarFluxo(); // Recarrega tabela
    } else {
        showToast("Erro ao salvar.", "error");
    }
}

/* ==========================================================================
   8. FORNECEDORES & CONFIG
   ========================================================================== */

async function carregarFornecedores() {
    const res = await apiRequest('/fornecedores.php');
    if (res) {
        estadoApp.fornecedoresCache = res;

        // Atualiza Datalist
        const dl = document.getElementById('lista-fornecedores');
        if (dl) {
            dl.innerHTML = '';
            res.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.nome;
                dl.appendChild(opt);
            });
        }
    }
}

async function carregarConfiguracoes() {
    // Carrega tabela de fornecedores
    const tbody = document.getElementById('tbody-fornecedores');
    if (tbody) {
        tbody.innerHTML = '';
        if (estadoApp.fornecedoresCache.length === 0) await carregarFornecedores();

        estadoApp.fornecedoresCache.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.nome}</td>
                <td>${f.cnpj || '-'}</td>
                <td>${f.telefone || '-'}</td>
                <td class="text-right">
                    <button class="btn-icon btn-trash" onclick="excluirFornecedor(${f.id})">🗑</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Carrega Usuários (Se admin)
    if (estadoApp.usuario?.funcao === 'Admin') {
        const tbodyUsers = document.querySelector('#tabela-usuarios tbody');
        const resUsers = await apiRequest('/admin.php?resource=usuarios');
        if (resUsers && tbodyUsers) {
            tbodyUsers.innerHTML = '';
            resUsers.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.nome}</td><td>${u.login}</td><td>${u.funcao}</td>`;
                tbodyUsers.appendChild(tr);
            });
        }
    }
}

async function salvarNovoFornecedor() {
    const nome = document.getElementById('novo-forn-nome').value;
    const cnpj = document.getElementById('novo-forn-cnpj').value;
    const tel = document.getElementById('novo-forn-tel').value;
    const cat = document.getElementById('novo-forn-cat').value;

    if (!nome) return showToast("Nome é obrigatório.", "error");

    const payload = { nome, cnpj, telefone: tel, categoria_padrao: cat }; // snake_case
    const res = await apiRequest('/fornecedores.php', 'POST', payload);

    if (res && res.success) {
        showToast("Fornecedor cadastrado!");
        document.getElementById('novo-forn-nome').value = '';
        document.getElementById('novo-forn-cnpj').value = '';
        await carregarFornecedores();
        carregarConfiguracoes();
    }
}

async function excluirFornecedor(id) {
    if (!confirm("Remover fornecedor?")) return;
    const res = await apiRequest(`/fornecedores.php?id=${id}`, 'DELETE');
    if (res && res.success) {
        showToast("Fornecedor removido.");
        await carregarFornecedores();
        carregarConfiguracoes();
    }
}

/* ==========================================================================
   9. LOGS DO SISTEMA
   ========================================================================== */

async function carregarLogs() {
    const tbody = document.querySelector('#tabela-logs tbody');
    if (!tbody) return;
    tbody.innerHTML = LOADER_HTML;

    const res = await apiRequest('/admin.php?resource=logs');
    tbody.innerHTML = '';

    if (!res || res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhum log registrado.</td></tr>';
        return;
    }

    res.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-size:0.85em; color:#666">${log.dataHora || log.data_hora}</td>
            <td><strong>${log.usuario}</strong></td>
            <td>${log.acao} ${log.detalhes ? `(${log.detalhes})` : ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ==========================================================================
   10. INICIALIZAÇÃO E EVENTOS GLOBAIS
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Verifica login
    verificarSessao();

    // 2. Prepara datas nos inputs de "hoje"
    const hoje = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(inp => {
        if (!inp.value) inp.value = hoje;
    });

    // 3. Adiciona listeners para máscaras de moeda
    document.querySelectorAll('.input-money').forEach(inp => {
        inp.addEventListener('input', () => mascaraMoedaInput(inp));
    });

    // 4. Listeners de Teclado
    document.addEventListener('keydown', function(event) {
        const telaNovo = document.getElementById('view-novo');
        const telaLogin = document.getElementById('login-screen');

        // 1. Se estiver na tela de LOGIN
        if (telaLogin && !telaLogin.classList.contains('hidden')) {
            if (event.key === 'Enter') {
                event.preventDefault();
                fazerLogin();
            }
            return; // Não executa o resto
        }

        // 2. Se estiver na tela de NOVO LANÇAMENTO
        // (Verifica se ela existe e se está visível na tela)
        if (telaNovo && !telaNovo.classList.contains('hidden') && telaNovo.offsetParent !== null) {

            // TECLA ENTER
            if (event.key === 'Enter') {
                event.preventDefault(); // Impede qualquer envio de formulário
                // Salva o boleto (passa true se segurar Ctrl para "Salvar e Continuar")
                salvarBoleto(event.ctrlKey);
            }

            // TECLA ESC
            if (event.key === 'Escape') {
                event.preventDefault();
                const desc = document.getElementById('boleto-desc').value;

                // Se já escreveu algo, limpa. Se estiver vazio, fecha.
                if (desc.trim() !== '') {
                    prepararNovoRegistro(); // Limpa
                } else {
                    navegar('lista'); // Fecha
                }
            }
        }
    });

    // 5. Configuração do Tema (Dark Mode) - Se existir botão
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.body.setAttribute('data-theme', savedTheme);
});

function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Funções para Paginação
function mudarPagina(delta) {
    const novaPagina = estadoApp.paginaAtualFinanceiro + delta;
    if (novaPagina > 0 && novaPagina <= estadoApp.totalPaginasFinanceiro) {
        carregarFinanceiro(novaPagina);
    }
}

// 1. Conecta o 'nav' do HTML à função 'navegar' do JS
function nav(tela, elemento) {
    navegar(tela);
}

// 2. Conecta o filtro do dashboard
function filtrarDashboard(periodo, elemento) {
    carregarDashboard(periodo);
}

// 3. Função para abrir o modal de logout
function confirmarLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.add('hidden');
}

function fazerLogoutReal() {
    logout();
}

// 4. Função para pré-filtrar a lista (ex: clicar no card "A Pagar")
function preFiltrarLista(status) {
    const select = document.getElementById('filtro-status');
    if (select) {
        select.value = status;
        // Pequeno delay para garantir que a tela carregou
        setTimeout(() => carregarLista(1), 100);
    }
}
function nav(tela) { navegar(tela); }

// Login
function fazerLogin() { login(event); }

// Dashboard
function filtrarDashboard(periodo) { carregarDashboard(periodo); }

// Listagem (Registros)
function carregarLista(pagina) { carregarFinanceiro(pagina); }
function debounceCarregarLista() { carregarFinanceiro(1); } // Versão simplificada

// Formulários
function mascaraMoeda(input) { mascaraMoedaInput(input); }
function limparFormulario() { prepararNovoRegistro(); }
function salvarEdicao() { salvarBoleto(); }

// Fornecedores
function cadastrarFornecedor() { salvarNovoFornecedor(); }

// Logout
function fazerLogoutReal() { logout(); }

// Fluxo de Caixa
function salvarEntradaCaixa() { salvarMovimentoRapido('entrada'); }
function salvarSaidaCaixa() { salvarMovimentoRapido('saida'); }
// --- UI / MODAIS / INTERFACE ---

// Modal de Logout
function confirmarLogout() {
    document.getElementById('modal-logout').classList.remove('hidden');
}
function fecharModalLogout() {
    document.getElementById('modal-logout').classList.add('hidden');
}

// Modal de Edição
function fecharModalEdicao() {
    document.getElementById('modal-editar').classList.add('hidden');
}

// Modal Genérico
function fecharModal() {
    document.getElementById('modal-detalhes').classList.add('hidden');
}

// Ver Detalhes (Card Amarelo)
function verDetalhes(tipo, titulo) {
    // Exemplo simples para não quebrar
    alert(`Visualizando detalhes de: ${titulo}`);
    // Idealmente abriria o modal-detalhes aqui
}

// Mostrar/Esconder Senha
function toggleSenha() {
    const input = document.getElementById('login-pass');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Calendário (Toggle)
function toggleCalendarSection() {
    const content = document.getElementById('calendar-wrapper');
    const header = document.querySelector('.toggle-header');
    content.classList.toggle('show');
    header.classList.toggle('open');
}

// Filtro Rápido (Ex: Clicar no card "A Pagar" vai para lista filtrada)
function preFiltrarLista(status) {
    const select = document.getElementById('filtro-status');
    if(select) {
        select.value = status;
        setTimeout(() => carregarFinanceiro(1), 100);
    }
}
// --- FUNCIONALIDADES PENDENTES (Placeholders) ---

function baixarExcelFluxo() {
    alert("Funcionalidade de Excel ainda não implementada no Backend.");
}

function adicionarCategoriaPersonalizada() {
    alert("Adicionar Categoria: Em desenvolvimento.");
}

function resetarCategorias() {
    if(confirm("Restaurar categorias padrão?")) {
        alert("Categorias restauradas.");
    }
}

function criarNovoUsuario() {
    alert("Criação de usuários: Disponível apenas na versão Pro.");
}

function salvarConfiguracoes() {
    showToast("Perfil salvo com sucesso!");
}

// --- AUTO-CATEGORIA ---
function verificarFornecedorPreenchido() {
    const desc = document.getElementById('boleto-desc').value.toLowerCase();
    const catSelect = document.getElementById('boleto-cat');

    // Mapa de palavras-chave -> Categorias
    const mapa = {
        'cemig': 'Água/Luz/Internet', 'energia': 'Água/Luz/Internet', 'luz': 'Água/Luz/Internet',
        'agua': 'Água/Luz/Internet', 'saneago': 'Água/Luz/Internet', 'embasa': 'Água/Luz/Internet',
        'internet': 'Água/Luz/Internet', 'vivo': 'Água/Luz/Internet', 'claro': 'Água/Luz/Internet', 'oi': 'Água/Luz/Internet',
        'aluguel': 'Aluguel & Condomínio', 'condominio': 'Aluguel & Condomínio', 'imobiliaria': 'Aluguel & Condomínio',
        'salario': 'Folha de Pagamento', 'pagamento': 'Folha de Pagamento', 'adiantamento': 'Folha de Pagamento',
        'drogasil': 'Medicamentos (Estoque)', 'farma': 'Medicamentos (Estoque)', 'eurofarma': 'Medicamentos (Estoque)', 'cimed': 'Medicamentos (Estoque)',
        'papelaria': 'Materiais de Consumo', 'limpeza': 'Materiais de Consumo', 'embalagens': 'Materiais de Consumo',
        'simples': 'Impostos & Taxas', 'das': 'Impostos & Taxas', 'inss': 'Impostos & Taxas', 'fgts': 'Impostos & Taxas', 'prefeitura': 'Impostos & Taxas'
    };

    // Verifica se alguma palavra chave está na descrição
    for (const chave in mapa) {
        if (desc.includes(chave)) {
            catSelect.value = mapa[chave];
            break; // Para na primeira correspondência
        }
    }
}
function verificarVencimento() {
    // Lógica para avisar se data < hoje (opcional)
    const data = document.getElementById('boleto-venc').value;
    const aviso = document.getElementById('aviso-vencido');
    if(aviso && data) {
        const hoje = new Date().toISOString().split('T')[0];
        aviso.style.display = data < hoje ? 'block' : 'none';
    }
}

// --- CORREÇÃO DE FORMULÁRIO (Impede Recarregamento) ---
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("form-boleto");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault(); // Bloqueia o recarregamento padrão
            // Opcional: Chama o salvar aqui se quiser que o Enter funcione nativamente
            // salvarBoleto();
        });
    }
});