/* ==========================================================================
   CONSTANTES & VARIÁVEIS GLOBAIS
   ========================================================================== */
const LOADER_HTML = `
    <tr class="loading-row">
        <td colspan="100%" style="text-align:center; padding: 40px;">
            <div class="loader-container"><div class="loader"></div></div>
        </td>
    </tr>
`;

// Categorias Padrão do Sistema
const CATEGORIAS_PADRAO = [
    "Medicamentos (Estoque)",
    "Materiais de Consumo",
    "Impostos & Taxas",
    "Folha de Pagamento",
    "Aluguel & Condomínio",
    "Água/Luz/Internet",
    "Marketing",
    "Manutenção",
    "Outros"
];

let chartM = null;
let chartC = null;
let calendarInstance = null;
let paginaAtual = 1;
let totalPaginas = 1;
let debounceTimer;
let listaFornecedoresCache = [];


/* ==========================================================================
   GERENCIAMENTO DE CATEGORIAS (LOCAL STORAGE)
   ========================================================================== */
function obterCategorias() {
    const custom = localStorage.getItem('categorias_custom');
    if (custom) {
        return JSON.parse(custom);
    }
    return [...CATEGORIAS_PADRAO];
}

function salvarCategorias(lista) {
    localStorage.setItem('categorias_custom', JSON.stringify(lista));
    carregarCategoriasNosSelects();
    renderizarCategoriasConfig();
    showToast("Lista de categorias atualizada!", "success");
}

function adicionarCategoriaPersonalizada() {
    const input = document.getElementById('nova-cat-nome');
    const nome = input.value.trim();

    if (!nome) return showToast("Digite um nome para a categoria.", "warning");

    const atuais = obterCategorias();
    // Verifica duplicidade ignorando maiúsculas/minúsculas
    if (atuais.some(c => c.toLowerCase() === nome.toLowerCase())) {
        return showToast("Categoria já existe.", "error");
    }

    atuais.push(nome);
    atuais.sort(); // Mantém alfabético
    salvarCategorias(atuais);
    input.value = "";
}

function removerCategoria(nome) {
    if (confirm(`Remover categoria "${nome}"?`)) {
        let atuais = obterCategorias();
        atuais = atuais.filter(c => c !== nome);
        salvarCategorias(atuais);
    }
}

function resetarCategorias() {
    if (confirm("Voltar para as categorias padrão?")) {
        localStorage.removeItem('categorias_custom');
        carregarCategoriasNosSelects();
        renderizarCategoriasConfig();
        showToast("Categorias resetadas.", "success");
    }
}

// Renderiza as tags na tela de Configuração
function renderizarCategoriasConfig() {
    const div = document.getElementById('lista-categorias-config');
    if (!div) return;

    const lista = obterCategorias();
    div.innerHTML = '';

    lista.forEach(cat => {
        const isPadrao = CATEGORIAS_PADRAO.includes(cat);
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.style.padding = '8px 12px';
        tag.style.marginRight = '8px';
        tag.style.marginBottom = '8px';

        let html = `<span>${cat}</span>`;
        if (!isPadrao) {
            html += ` <span style="cursor:pointer; margin-left:8px; color:var(--danger); font-weight:bold;" onclick="removerCategoria('${cat}')" title="Remover">×</span>`;
        }
        tag.innerHTML = html;
        div.appendChild(tag);
    });
}

// Popula todos os <select> do sistema com as categorias atuais
function carregarCategoriasNosSelects() {
    const lista = obterCategorias();
    // IDs dos selects que precisam de categorias
    const selects = ['boleto-cat', 'filtro-cat', 'edit-cat', 'novo-forn-cat'];

    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // Guarda valor selecionado atual para não perder seleção ao recarregar
        const valorAtual = el.value;

        // Limpa opções
        let html = '';
        if (id === 'filtro-cat') {
            html = '<option value="Todas">Categoria: Todas</option>';
        } else {
            html = '<option value="">Selecione...</option>';
        }

        lista.forEach(cat => {
            html += `<option value="${cat}">${cat}</option>`;
        });

        el.innerHTML = html;

        // Tenta restaurar valor se ainda existir na lista
        if (valorAtual && (lista.includes(valorAtual) || valorAtual === 'Todas')) {
            el.value = valorAtual;
        }
    });
}

/* ==========================================================================
   UTILITÁRIOS DE UI (Toast, Sidebar, Theme)
   ========================================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⚠️');

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.toggle('active');

    if (overlay) overlay.style.display = (sidebar && sidebar.classList.contains('active')) ? 'block' : 'none';
}

function toggleDarkMode() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        document.getElementById('text-theme').innerText = "Modo Escuro";
    } else {
        body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('text-theme').innerText = "Modo Claro";
    }
}

/* ==========================================================================
   FORMATAÇÃO & VALIDAÇÃO
   ========================================================================== */
function mascaraMoeda(i) {
    let v = i.value.replace(/\D/g, '');
    v = (v / 100).toFixed(2) + '';
    v = v.replace(".", ",");
    v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    i.value = "R$ " + v;
}

function formatarValorParaBanco(valorStr) {
    if (!valorStr) return 0.0;
    let limpo = valorStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    return parseFloat(limpo);
}

function validarFormulario() {
    let valido = true;
    const validar = (id, idErro) => {
        const el = document.getElementById(id);
        const err = document.getElementById(idErro);
        if (!el || el.offsetParent === null) return null; // Campo oculto

        if (!el.value || el.value === "") {
            el.classList.add('input-error');
            if (err) err.style.display = 'block';
            valido = false;
        } else {
            el.classList.remove('input-error');
            if (err) err.style.display = 'none';
        }
        return el.value;
    };

    validar('boleto-desc', 'err-desc');
    let v = validar('boleto-valor', 'err-valor');
    if (v && formatarValorParaBanco(v) === 0) {
        document.getElementById('boleto-valor')?.classList.add('input-error');
        valido = false;
    }
    validar('boleto-venc', 'err-venc');
    return valido;
}

function limparFormulario() {
    const ids = ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat', 'boleto-status'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = (id === 'boleto-status') ? "Pendente" : "";
            el.classList.remove('input-error');
        }
    });
    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
    document.getElementById('aviso-vencido').style.display = 'none';
}

/* ==========================================================================
   AUTH & SESSÃO
   ========================================================================== */
function toggleSenha() {
    const campo = document.getElementById('login-pass');
    campo.type = campo.type === "password" ? "text" : "password";
}

async function fazerLogin() {
    const userEl = document.getElementById('login-user');
    const passEl = document.getElementById('login-pass');
    const btn = document.getElementById('btn-entrar');

    if (!userEl || !passEl) return;
    btn.disabled = true;
    btn.innerHTML = 'Verificando...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: userEl.value, senha: passEl.value })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('user-display').innerText = data.nome;
            sessionStorage.setItem('user_role', data.funcao);
            btn.innerHTML = '✓ Sucesso!';
            showToast(`Bem-vindo, ${data.nome}!`, "success");

            setTimeout(() => {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-screen').classList.remove('hidden');
                nav('dashboard', null, true);
            }, 800);
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Acessar Painel';
        showToast("Usuário ou senha inválidos.", "error");
    }
}

async function verificarSessao() {
    try {
        const res = await fetch('/api/dados_usuario');
        const data = await res.json();

        if (data.login) {
            document.getElementById('user-display').innerText = data.nome;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            const hash = window.location.hash.replace('#', '') || 'dashboard';
            nav(hash, null, false);
        }
    } catch (e) {
        console.log("Sem sessão ativa ou erro de conexão.");
    }
}

async function fazerLogout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

async function fazerLogoutReal() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

function confirmarLogout() { document.getElementById('modal-logout')?.classList.remove('hidden'); }
function fecharModalLogout() { document.getElementById('modal-logout')?.classList.add('hidden'); }

/* ==========================================================================
   NAVEGAÇÃO (SPA)
   ========================================================================== */
function nav(viewId, elementoMenu, addToHistory = true) {
    // 1. Alternar Views
    document.querySelectorAll('.content > div').forEach(el => {
        if (!el.id.startsWith('modal')) el.classList.add('hidden');
    });

    const view = document.getElementById('view-' + viewId);
    if (view) {
        view.classList.remove('hidden');
    } else {
        nav('dashboard', null, false);
        return;
    }

    // 2. Menu Ativo
    if (!elementoMenu) {
        elementoMenu = document.querySelector(`.menu-item[onclick*="'${viewId}'"]`);
    }
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (elementoMenu) elementoMenu.classList.add('active');

    // 3. Histórico
    if (addToHistory) history.pushState({ view: viewId }, '', `#${viewId}`);

    // 4. Mobile e UX
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 1024 && sidebar && sidebar.classList.contains('active')) {
        toggleSidebar();
    }

    // 5. Carregamento Específico por Tela
    if (viewId === 'dashboard') {
        setTimeout(() => carregarDashboard(), 50);
        verificarPermissoesUI();
    }
    if (viewId === 'lista') {
        // Se já tiver filtros, mantém, senão carrega padrão
        carregarLista(1);
    }
    if (viewId === 'logs') carregarLogs();
    if (viewId === 'config') {
        carregarConfiguracoes();
        renderizarCategoriasConfig();
        verificarPermissoesUI();
        if (sessionStorage.getItem('user_role') === 'Admin') {
            carregarListaUsuarios();
        }
    }
    if (viewId === 'fluxo') {
        const inputMes = document.getElementById('filtro-mes-fluxo');
        if (!inputMes.value) {
            const hoje = new Date();
            inputMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        }
        carregarFluxo();
    }

    // 6. Autofocus (Melhoria Novo Lançamento)
    if (viewId === 'novo') {
        setTimeout(() => {
            document.getElementById('boleto-cod')?.focus();
        }, 100);
    }
}

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) nav(event.state.view, null, false);
    else nav('dashboard', null, false);
});

function verificarPermissoesUI() {
    const role = sessionStorage.getItem('user_role');
    const adminItems = document.querySelectorAll('.admin-only');
    const roleEl = document.getElementById('user-role');

    if (role === 'Admin') {
        adminItems.forEach(el => el.classList.remove('hidden'));
        if (roleEl) roleEl.innerText = "Administrador";
    } else {
        adminItems.forEach(el => el.classList.add('hidden'));
        if (roleEl) roleEl.innerText = "Operador";
    }
}

/* ==========================================================================
   DASHBOARD & CALENDÁRIO
   ========================================================================== */
function filtrarDashboard(periodo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    carregarDashboard(periodo);
}

function preFiltrarLista(status) {
    const select = document.getElementById('filtro-status');
    if(select) select.value = status;
    carregarLista(1);
    showToast(`Filtrando por: ${status}`, "success");
}

async function carregarDashboard(periodo = null) {
    if (!periodo) periodo = localStorage.getItem('dashboard_periodo') || '7d';
    localStorage.setItem('dashboard_periodo', periodo);

    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        if(b.getAttribute('onclick').includes(`'${periodo}'`)) b.classList.add('active');
    });

    const containerCharts = document.getElementById('charts-container');
    const containerEmpty = document.getElementById('dashboard-empty-state');
    if (containerCharts) containerCharts.style.opacity = '0.5';

    try {
        const res = await fetch(`/api/dashboard?periodo=${periodo}`);
        const data = await res.json();

        // Cards
        if (data.cards) {
            const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

            setTxt('card-pagar-mes', fmt(data.cards.pagar_mes));
            setTxt('card-vencidos-val', fmt(data.cards.vencidos_val));
            setTxt('card-vencidos-qtd', `${data.cards.vencidos_qtd} un.`);
            setTxt('card-proximos-val', fmt(data.cards.proximos_val));
            setTxt('card-proximos-qtd', `${data.cards.proximos_qtd} un.`);
            setTxt('card-pago-mes', fmt(data.cards.pago_mes));
        }

        // Gráficos vs Empty State
        const temDados = data.graficos.por_mes && data.graficos.por_mes.length > 0;
        if (!temDados) {
            if (containerCharts) containerCharts.classList.add('hidden');
            if (containerEmpty) containerEmpty.classList.remove('hidden');
        } else {
            if (containerCharts) { containerCharts.classList.remove('hidden'); containerCharts.style.opacity = '1'; }
            if (containerEmpty) containerEmpty.classList.add('hidden');
            renderCharts(data.graficos);
        }
    } catch (e) {
        console.error("Erro no dashboard:", e);
    }
}

function renderCharts(graficos) {
    const canvasM = document.getElementById('chartMes');
    if (canvasM) {
        const ctxM = canvasM.getContext('2d');
        if (chartM) chartM.destroy();

        let gradient = ctxM.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

        chartM = new Chart(ctxM, {
            type: 'line',
            data: {
                labels: graficos.por_mes.map(d => d.mes),
                datasets: [{
                    label: 'Total R$',
                    data: graficos.por_mes.map(d => d.total),
                    borderColor: '#2563eb',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5], color: '#e2e8f0' } }, x: { grid: { display: false } } }
            }
        });
    }

    const canvasC = document.getElementById('chartCat');
    if (canvasC) {
        const ctxC = canvasC.getContext('2d');
        if (chartC) chartC.destroy();
        chartC = new Chart(ctxC, {
            type: 'doughnut',
            data: {
                labels: graficos.por_categoria.map(d => d.categoria),
                datasets: [{
                    data: graficos.por_categoria.map(d => d.total),
                    backgroundColor: ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }, cutout: '70%'
            }
        });
    }
}

function toggleCalendarSection() {
    const wrapper = document.getElementById('calendar-wrapper');
    const header = document.querySelector('.toggle-header');
    wrapper.classList.toggle('show');
    header.classList.toggle('open');
    if (wrapper.classList.contains('show')) setTimeout(() => initCalendar(), 50);
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    if (calendarInstance) { calendarInstance.updateSize(); calendarInstance.refetchEvents(); return; }
    if (typeof FullCalendar === 'undefined') return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'pt-br', height: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
        buttonText: { today: 'Hoje', month: 'Mês', list: 'Lista' },
        events: '/api/calendario',
        eventClick: (info) => showToast(`📅 ${info.event.title}`, "success")
    });
    calendarInstance.render();
}

async function verDetalhes(tipo, titulo) {
    const modal = document.getElementById('modal-detalhes');
    const tbody = document.querySelector('#tabela-modal tbody');
    document.getElementById('modal-titulo').innerText = titulo;
    tbody.innerHTML = LOADER_HTML;
    modal.classList.remove('hidden');

    try {
        const res = await fetch('/api/detalhes_card', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: tipo })
        });
        const lista = await res.json();
        tbody.innerHTML = '';

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhum registro encontrado.</td></tr>';
        } else {
            lista.forEach(item => {
                const valor = item.valor ? parseFloat(item.valor).toFixed(2) : '0.00';
                const desc = item.descricao || 'Sem descrição';
                const venc = item.vencimento || '--/--/----';
                const status = item.status || 'Pendente';
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${venc}</td><td></td><td style="font-weight:bold;">R$ ${valor}</td><td><span class="status-badge status-${status}">${status}</span></td>`;
                tr.children[1].textContent = desc;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Erro ao carregar.</td></tr>';
    }
}

function fecharModal() { document.getElementById('modal-detalhes')?.classList.add('hidden'); }
document.getElementById('modal-detalhes')?.addEventListener('click', function(e) { if(e.target === this) fecharModal(); });

/* ==========================================================================
   NOVO LANÇAMENTO (Lógica & Automação)
   ========================================================================== */
function sugerirCategoria() {
    const desc = document.getElementById('boleto-desc').value.toLowerCase();
    const catEl = document.getElementById('boleto-cat');

    // Mapa de sugestões por palavra-chave (pode ser expandido)
    const mapa = {
        'medicamento': 'Medicamentos (Estoque)', 'cimed': 'Medicamentos (Estoque)', 'ems': 'Medicamentos (Estoque)',
        'nc': 'Medicamentos (Estoque)', 'profarma': 'Medicamentos (Estoque)', 'papel': 'Materiais de Consumo',
        'limpeza': 'Materiais de Consumo', 'enel': 'Água/Luz/Internet', 'luz': 'Água/Luz/Internet',
        'agua': 'Água/Luz/Internet', 'sabesp': 'Água/Luz/Internet', 'internet': 'Água/Luz/Internet',
        'vivo': 'Água/Luz/Internet', 'claro': 'Água/Luz/Internet', 'aluguel': 'Aluguel & Condomínio',
        'condominio': 'Aluguel & Condomínio', 'simples': 'Impostos & Taxas', 'das': 'Impostos & Taxas',
        'iptu': 'Impostos & Taxas', 'salario': 'Folha de Pagamento', 'folha': 'Folha de Pagamento', 'manutencao': 'Manutenção'
    };

    if (catEl.value === "") {
        for (const [chave, valor] of Object.entries(mapa)) {
            if (desc.includes(chave)) {
                catEl.value = valor;
                catEl.style.backgroundColor = "#dcfce7";
                setTimeout(() => catEl.style.backgroundColor = "", 1000);
                break;
            }
        }
    }
}

function verificarVencimento() {
    const dataInput = document.getElementById('boleto-venc').value;
    const aviso = document.getElementById('aviso-vencido');
    if (!dataInput) { if(aviso) aviso.style.display = 'none'; return; }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const venc = new Date(dataInput + 'T00:00:00');
    if(aviso) aviso.style.display = (venc < hoje) ? 'block' : 'none';
}

async function lerCodigoBarras() {
    const codInput = document.getElementById('boleto-cod');
    const cod = codInput.value;
    if (!cod) return;

    codInput.style.opacity = "0.5";
    try {
        const res = await fetch('/api/ler_codigo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: cod })
        });
        const data = await res.json();
        codInput.style.opacity = "1";

        if (data.valor) {
            let valF = data.valor.toFixed(2).replace('.', ',');
            const elVal = document.getElementById('boleto-valor');
            elVal.value = `R$ ${valF}`;
            mascaraMoeda(elVal);
            showToast("Código lido!", "success");
        }
        if (data.vencimento) document.getElementById('boleto-venc').value = data.vencimento;

        // Automações pós-leitura
        verificarVencimento();
        setTimeout(() => document.getElementById('boleto-desc').focus(), 100);

    } catch (e) {
        codInput.style.opacity = "1";
        showToast("Erro código de barras.", "error");
    }
}

async function salvarBoleto(manterAberto = true) {
    if (!validarFormulario()) { showToast("Preencha os campos obrigatórios.", "error"); return; }

    const dados = {
        codigo: document.getElementById('boleto-cod').value,
        descricao: document.getElementById('boleto-desc').value,
        valor: formatarValorParaBanco(document.getElementById('boleto-valor').value),
        vencimento: document.getElementById('boleto-venc').value,
        categoria: document.getElementById('boleto-cat').value,
        status: document.getElementById('boleto-status').value
    };

    try {
        const res = await fetch('/api/novo_boleto', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const resp = await res.json();

        if (resp.success) {
            showToast(manterAberto ? "Salvo! Pronto para o próximo." : "Salvo com sucesso!", "success");
            limparFormulario();
            if (manterAberto) document.getElementById('boleto-cod').focus();
            else nav('lista');
        } else {
            showToast("Erro: " + resp.message, "error");
        }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

/* ==========================================================================
   LISTAGEM & CRUD
   ========================================================================== */
function debounceCarregarLista() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        carregarLista(1);
    }, 400); // Aguarda 400ms após parar de digitar
}

// Atualiza o texto de resumo (Ex: "Mostrando: Pendentes • Energia")
function atualizarResumoFiltros(busca, status, cat) {
    const div = document.getElementById('filtro-resumo');
    if (!div) return;

    let html = '<span>Visualizando:</span>';

    if (busca) html += `<span class="filter-tag">🔍 "${busca}"</span>`;
    html += `<span class="filter-tag">${status === 'Todos' ? 'Todos os Status' : status}</span>`;
    html += `<span class="filter-tag">${cat === 'Todas' ? 'Todas as Categorias' : cat}</span>`;

    div.innerHTML = html;
}

async function carregarLista(pagina = 1) {
    paginaAtual = pagina;
    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status').value;
    const cat = document.getElementById('filtro-cat').value;
    const tbody = document.querySelector('#tabela-registros tbody');

    // Previne erro se a tabela não existir na view atual
    if (!tbody) return;

    tbody.innerHTML = LOADER_HTML;
    atualizarResumoFiltros(busca, status, cat);

    const params = new URLSearchParams({ pagina: paginaAtual, busca: busca, status: status, categoria: cat });

    try {
        const res = await fetch(`/api/registros?${params}`);
        const data = await res.json();
        totalPaginas = data.total_paginas;

        const infoPag = document.getElementById('info-paginas');
        if (infoPag) infoPag.innerText = `Pág. ${data.pagina_atual} de ${data.total_paginas || 1}`;

        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        if (btnAnt) btnAnt.disabled = (paginaAtual <= 1);
        if (btnProx) btnProx.disabled = (paginaAtual >= totalPaginas);

        tbody.innerHTML = '';
        if (!data.registros || data.registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #64748b;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        const hoje = new Date();
        hoje.setHours(0,0,0,0);

        data.registros.forEach(item => {
            let classeStatus = `status-${item.status}`;
            let textoStatus = item.status || 'Desconhecido';
            let valorFmt = item.valor ? parseFloat(item.valor).toFixed(2).replace('.', ',') : '0,00';
            let classeLinha = '';

            // Lógica de Cores da Linha (Highlight) e Status Automático
            if (item.status === 'Pendente' && item.vencimento) {
                const parts = item.vencimento.split('/');
                if (parts.length === 3) {
                    const dtVenc = new Date(parts[2], parts[1] - 1, parts[0]);

                    // Cálculo de diferença em dias
                    const diffTempo = dtVenc - hoje;
                    const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));

                    if (dtVenc < hoje) {
                        classeStatus = 'status-Vencido';
                        textoStatus = 'Vencido';
                        classeLinha = 'row-vencido'; // Vermelho
                    } else if (diffDias >= 0 && diffDias <= 5) {
                        classeLinha = 'row-proximo'; // Amarelo (Vence em até 5 dias)
                    }
                }
            }

            let btnCopiar = '';
            if (item.codigo_barras) {
                btnCopiar = `<button class="action-btn" title="Copiar Código de Barras" onclick="copiarCodigo('${item.codigo_barras}')">📋</button>`;
            }

            // 2. Botão Site Caixa (Sempre visível)
            const btnCaixa = `<button class="action-btn" title="Acessar Site da Caixa (Internet Banking)" style="color:#005ca9; font-weight:bold;" onclick="abrirSiteCaixa()">🏦</button>`;

            // 3. Botão Excluir (Só se tiver permissão)
            const btnExcluir = data.perm_excluir
                ? `<button class="action-btn" title="Excluir Registro Permanentemente" style="color:#ef4444" onclick="excluir(${item.id})">🗑️</button>`
                : '';

            // 4. Botão de Ação Principal (Pagar ou Reabrir)
            const btnAcao = item.status === 'Pendente'
                ? `<button class="action-btn" title="Marcar como Pago (Baixar)" style="color:#059669; font-weight:bold;" onclick="mudarStatus(${item.id}, 'Pago')">✔</button>`
                : `<button class="action-btn" title="Reabrir (Marcar como Pendente)" style="color:#d97706" onclick="mudarStatus(${item.id}, 'Pendente')">↺</button>`;

            // --- MONTAGEM DA LINHA ---
            const tr = document.createElement('tr');
            if (classeLinha) tr.className = classeLinha;

            // Prepara o objeto para passar na função de edição
            const itemSafe = JSON.stringify(item).replace(/"/g, '&quot;');

            tr.innerHTML = `
                <td style="font-family:monospace;">${item.vencimento || '--'}</td>
                <td style="font-weight:500;"></td>
                <td><small style="background:var(--bg-body);padding:4px 8px;border-radius:4px;border:1px solid var(--border);">${item.categoria || 'Geral'}</small></td>
                <td style="font-weight:700;">R$ ${valorFmt}</td>
                <td><span class="${classeStatus} status-badge">${textoStatus}</span></td>
                <td style="text-align:right; white-space: nowrap;">
                    ${btnCopiar}
                    ${btnCaixa}
                    <span style="border-left:1px solid var(--border); margin:0 5px; height:20px; vertical-align:middle; display:inline-block;"></span>
                    <button class="action-btn" title="Editar Detalhes do Lançamento" onclick="abrirModalEdicao(${itemSafe})">✏️</button>
                    ${btnAcao} ${btnExcluir}
                </td>`;

            tr.children[1].textContent = item.descricao || 'Sem Descrição';
            tbody.appendChild(tr);
        });
    } catch (e) {
        if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Erro de conexão.</td></tr>';
    }
}

function mudarPagina(delta) {
    const nova = paginaAtual + delta;
    if (nova >= 1 && nova <= totalPaginas) carregarLista(nova);
}

async function mudarStatus(id, novoStatus) {
    await fetch('/api/atualizar_status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, status: novoStatus })
    });
    showToast(`Status alterado: ${novoStatus}`, "success");
    carregarLista(paginaAtual);
}

async function excluir(id) {
    if (!confirm("Excluir registro?")) return;
    try {
        const res = await fetch('/api/excluir', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        const d = await res.json();
        if (d.success) { showToast("Registro excluído.", "warning"); carregarLista(paginaAtual); }
        else showToast(d.message, "error");
    } catch (e) { showToast("Erro exclusão.", "error"); }
}

function abrirModalEdicao(item) {
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-desc').value = item.descricao;
    let val = item.valor ? parseFloat(item.valor).toFixed(2).replace('.', ',') : '0,00';
    document.getElementById('edit-valor').value = `R$ ${val}`;

    if (item.vencimento) {
        const parts = item.vencimento.split('/');
        if (parts.length === 3) document.getElementById('edit-venc').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    document.getElementById('edit-cat').value = item.categoria || 'Outros';
    document.getElementById('edit-status').value = item.status || 'Pendente';
    document.getElementById('modal-editar')?.classList.remove('hidden');
}

function fecharModalEdicao() { document.getElementById('modal-editar')?.classList.add('hidden'); }
document.getElementById('modal-editar')?.addEventListener('click', function(e) { if(e.target === this) fecharModalEdicao(); });

async function salvarEdicao() {
    const dados = {
        id: document.getElementById('edit-id').value,
        descricao: document.getElementById('edit-desc').value,
        valor: formatarValorParaBanco(document.getElementById('edit-valor').value),
        vencimento: document.getElementById('edit-venc').value,
        categoria: document.getElementById('edit-cat').value,
        status: document.getElementById('edit-status').value
    };
    try {
        const res = await fetch('/api/editar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if ((await res.json()).success) {
            showToast("Atualizado!", "success");
            fecharModalEdicao();
            carregarLista(paginaAtual);
        } else { showToast("Erro editar.", "error"); }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

/* ==========================================================================
   FLUXO DE CAIXA
   ========================================================================== */
async function carregarFluxo() {
    const inputMes = document.getElementById('filtro-mes-fluxo').value;
    if (!inputMes) return;
    const [ano, mes] = inputMes.split('-');
    const tbody = document.querySelector('#tabela-fluxo tbody');
    tbody.innerHTML = LOADER_HTML;

    try {
        const res = await fetch(`/api/fluxo_resumo?mes=${mes}&ano=${ano}`);
        const data = await res.json();
        const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        document.getElementById('fluxo-entradas').innerText = fmt(data.entradas_total);
        document.getElementById('detalhe-entradas').innerText = `Din: ${fmt(data.entradas_dinheiro)} | Pix: ${fmt(data.entradas_pix)} | Cart: ${fmt(data.entradas_cartao)}`;
        document.getElementById('fluxo-saidas').innerText = fmt(data.saidas_total);

        const elSaldo = document.getElementById('fluxo-saldo');
        elSaldo.innerText = fmt(data.saldo);
        elSaldo.style.color = data.saldo >= 0 ? 'var(--success)' : 'var(--danger)';
        document.getElementById('fluxo-status-texto').innerText = data.saldo >= 0 ? "Saldo Positivo" : "Saldo Negativo";

        tbody.innerHTML = '';
        if (data.extrato.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Sem movimentações.</td></tr>';
        } else {
            data.extrato.forEach(item => {
                const tr = document.createElement('tr');
                const isEntrada = item.tipo === 'entrada';
                const cor = isEntrada ? 'var(--success)' : 'var(--danger)';
                const sinal = isEntrada ? '+' : '-';
                tr.setAttribute('data-fluxo-tipo', isEntrada ? 'entrada' : 'saida');

                let btnExcluir = '';
                if (sessionStorage.getItem('user_role') === 'Admin') {
                    if (item.tipo === 'entrada' || item.tipo === 'saida_caixa') {
                        btnExcluir = `<button class="action-btn" style="color:var(--danger)" onclick="excluirItemFluxo(${item.id}, '${item.tipo}')">×</button>`;
                    }
                }

                let dataFmt = item.data;
                try { const p = item.data.split('-'); dataFmt = `${p[2]}/${p[1]}`; } catch (e) { }

                tr.innerHTML = `<td><small>${dataFmt}</small></td><td></td>
                    <td><span style="font-size:0.75rem; background:var(--bg-body); padding:2px 6px; border-radius:4px; border:1px solid var(--border);">${item.categoria}</span></td>
                    <td style="color:${cor}; font-weight:bold;">${sinal} ${fmt(item.valor)}</td>
                    <td style="text-align:right;">${btnExcluir}</td>`;
                tr.children[1].textContent = item.descricao;
                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
}

function filtrarFluxo(tipo) {
    document.querySelectorAll('#tabela-fluxo tbody tr').forEach(tr => {
        const tipoLinha = tr.getAttribute('data-fluxo-tipo');
        tr.style.display = (tipo === 'todos' || tipoLinha === tipo) ? '' : 'none';
    });
    let msg = tipo === 'todos' ? "Todos os registros." : (tipo === 'entrada' ? "Apenas Entradas." : "Apenas Saídas.");
    showToast(msg, "success");
}

async function salvarEntradaCaixa() {
    const valorStr = document.getElementById('ent-valor').value;
    const forma = document.getElementById('ent-forma').value;
    const dataEnt = document.getElementById('ent-data').value;
    const valor = formatarValorParaBanco(valorStr);

    try {
        const res = await fetch('/api/nova_entrada', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valor: valor, forma: forma, data: dataEnt })
        });
        if ((await res.json()).success) {
            showToast("Entrada registrada!", "success");
            document.getElementById('ent-valor').value = '';
            carregarFluxo();
        } else showToast("Erro ao salvar.", "error");
    } catch (e) { showToast("Erro de conexão.", "error"); }
}

async function salvarSaidaCaixa() {
    const desc = document.getElementById('sai-desc').value;
    const valorStr = document.getElementById('sai-valor').value;
    const forma = document.getElementById('sai-forma').value;
    const dataSai = document.getElementById('sai-data').value;
    if (!valorStr || !dataSai || !desc) { showToast("Preencha descrição, valor e data.", "warning"); return; }

    try {
        const res = await fetch('/api/nova_saida_caixa', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descricao: desc, valor: formatarValorParaBanco(valorStr), forma: forma, data: dataSai })
        });
        if ((await res.json()).success) {
            showToast("Saída registrada!", "success");
            document.getElementById('sai-valor').value = '';
            document.getElementById('sai-desc').value = '';
            carregarFluxo();
        } else showToast("Erro ao salvar.", "error");
    } catch (e) { showToast("Erro conexão.", "error"); }
}

async function excluirItemFluxo(id, tipo) {
    if (!confirm("Excluir este lançamento?")) return;
    let url = (tipo === 'entrada') ? '/api/excluir_entrada' : '/api/excluir_saida_caixa';
    try {
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        if ((await res.json()).success) { showToast("Removido.", "success"); carregarFluxo(); }
        else showToast("Erro ao excluir.", "error");
    } catch (e) { showToast("Erro.", "error"); }
}

async function excluirEntrada(id) { await excluirItemFluxo(id, 'entrada'); }

function baixarExcelFluxo() {
    const inputMes = document.getElementById('filtro-mes-fluxo').value;
    if (!inputMes) { showToast("Selecione um mês/ano.", "warning"); return; }
    const [ano, mes] = inputMes.split('-');
    window.location.href = `/api/exportar_fluxo_excel?mes=${mes}&ano=${ano}`;
}

/* ==========================================================================
   CONFIGURAÇÕES & LOGS
   ========================================================================== */
async function carregarConfiguracoes() {
    try {
        const res = await fetch('/api/dados_usuario');
        const data = await res.json();
        if (data.login) {
            document.getElementById('conf-login').value = data.login;
            document.getElementById('conf-nome').value = data.nome;
        }
    } catch (e) { }
}

async function salvarConfiguracoes() {
    const dados = {
        novo_login: document.getElementById('conf-login').value,
        novo_nome: document.getElementById('conf-nome').value,
        nova_senha: document.getElementById('conf-senha').value
    };
    try {
        const res = await fetch('/api/alterar_perfil', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if ((await res.json()).success) {
            showToast("Perfil salvo.", "success");
            document.getElementById('user-display').innerText = dados.novo_nome;
            document.getElementById('conf-senha').value = "";
        } else showToast("Erro salvar.", "error");
    } catch (e) { showToast("Erro conexão.", "error"); }
}

async function carregarLogs() {
    const tbody = document.querySelector('#tabela-logs tbody');
    if (tbody) tbody.innerHTML = LOADER_HTML;
    try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        if (tbody) {
            tbody.innerHTML = '';
            logs.forEach(l => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${l.data_hora}</td><td><b>${l.usuario}</b></td><td>${l.acao}</td><td><small></small></td>`;
                tr.querySelector('small').textContent = l.detalhes;
                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error("Erro logs", e); }
}

/* ==========================================================================
   INICIALIZAÇÃO & EVENTOS GLOBAIS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Tenta restaurar sessão e estado da página (Persistence)
    verificarSessao();

    // 2. Carrega Tema
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.getElementById('text-theme').innerText = "Modo Claro";
    }

    // 3. Inicializa Categorias (Carrega nos selects e config)
    carregarCategoriasNosSelects();
    renderizarCategoriasConfig();
    carregarFornecedores();

    // 4. Define datas padrão (Hoje)
    const hoje = new Date().toISOString().split('T')[0];
    const i1 = document.getElementById('ent-data');
    const i2 = document.getElementById('sai-data');
    if (i1) i1.value = hoje;
    if (i2) i2.value = hoje;

    // --- CORREÇÃO AQUI: ADICIONE ESTE BLOCO PARA O LOGIN FUNCIONAR COM ENTER ---
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');

    function checkLoginEnter(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evita qualquer comportamento estranho do navegador
            fazerLogin();       // Chama a função de login diretamente
        }
    }

    if (inputUser) inputUser.addEventListener('keydown', checkLoginEnter);
    if (inputPass) inputPass.addEventListener('keydown', checkLoginEnter);
    // --------------------------------------------------------------------------

    // 5. Listener Enter para Formulário (Código existente...)
    const campos = ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat', 'boleto-status'];
    campos.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (idx === campos.length - 1) salvarBoleto();
                    else {
                        const prox = document.getElementById(campos[idx + 1]);
                        if (prox) prox.focus();
                    }
                }
            });
        }
    });
});

// Atalhos Globais (Teclado)
document.addEventListener('keydown', function(e) {
    const viewNovo = document.getElementById('view-novo');
    if (!viewNovo || viewNovo.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        limparFormulario();
        document.getElementById('boleto-cod').focus();
        showToast("Formulário limpo.", "warning");
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.target.tagName !== 'BUTTON')) {
        if (document.activeElement.innerText.includes("Salvar")) return;
        e.preventDefault();
        salvarBoleto(true);
    }
});

async function criarNovoUsuario() {
    const nome = document.getElementById('novo-user-nome').value;
    const login = document.getElementById('novo-user-login').value;
    const senha = document.getElementById('novo-user-senha').value;
    const funcao = document.getElementById('novo-user-funcao').value;

    if(!nome || !login || !senha) return showToast("Preencha todos os campos.", "warning");

    try {
        const res = await fetch('/api/criar_usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome, usuario: login, senha: senha, funcao: funcao })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            // Limpa os campos após sucesso
            document.getElementById('novo-user-nome').value = "";
            document.getElementById('novo-user-login').value = "";
            document.getElementById('novo-user-senha').value = "";
            carregarListaUsuarios();
        } else {
            showToast(data.message, "error");
        }
    } catch (e) {
        showToast("Erro de conexão.", "error");
    }
}
/* ==========================================================================
   NOVAS FUNÇÕES: UTILITÁRIOS DE PAGAMENTO
   ========================================================================== */
function copiarCodigo(codigo) {
    if (!codigo || codigo === 'null' || codigo === 'undefined') {
        return showToast("Não há código de barras cadastrado.", "warning");
    }

    navigator.clipboard.writeText(codigo).then(() => {
        showToast("Código copiado para a área de transferência!", "success");
    }).catch(err => {
        console.error(err);
        showToast("Erro ao copiar código.", "error");
    });
}

function abrirSiteCaixa() {
    // Abre o site da Caixa em nova aba
    window.open('https://www.caixa.gov.br', '_blank');
}

/*FORNECEDORES*/
async function carregarFornecedores() {
    try {
        const res = await fetch('/api/fornecedores');
        const lista = await res.json();
        listaFornecedoresCache = lista; // Guarda na memória: [{nome: 'Cimed', categoria_padrao: 'Medicamentos'}, ...]

        // 1. Preenche o DataList (Autocomplete do Novo Lançamento)
        const datalist = document.getElementById('lista-fornecedores');
        if (datalist) {
            datalist.innerHTML = '';
            lista.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.nome;
                // Dica: Adicione a categoria como label visual (alguns browsers mostram)
                if(f.categoria_padrao) opt.label = f.categoria_padrao;
                datalist.appendChild(opt);
            });
        }

        // 2. Preenche a tabela na Configuração (se estiver na tela)
        renderizarTabelaFornecedores();

    } catch (e) {
        console.error("Erro ao buscar fornecedores", e);
    }
}

function verificarFornecedorPreenchido() {
    const inputDesc = document.getElementById('boleto-desc');
    const selectCat = document.getElementById('boleto-cat');

    if (!inputDesc || !selectCat) return;

    const valorDigitado = inputDesc.value.trim();

    // Procura na memória se existe um fornecedor com esse nome (case insensitive)
    const fornecedorEncontrado = listaFornecedoresCache.find(f =>
        f.nome.toLowerCase() === valorDigitado.toLowerCase()
    );

    if (fornecedorEncontrado && fornecedorEncontrado.categoria_padrao) {
        selectCat.value = fornecedorEncontrado.categoria_padrao;

        // Efeito visual
        selectCat.style.backgroundColor = "#dcfce7";
        selectCat.style.transition = "background-color 0.5s";
        setTimeout(() => selectCat.style.backgroundColor = "", 1000);
    } else {
        // Se não achou, usa a lógica antiga de palavras-chave
        sugerirCategoria();
    }
}

// Renderiza a lista na tela de Configurações
function renderizarTabelaFornecedores() {
    const tbody = document.getElementById('tabela-fornecedores-config');
    if (!tbody) return;

    tbody.innerHTML = '';
    listaFornecedoresCache.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px;">${f.nome}</td>
            <td style="padding: 10px; color:var(--text-light);"><small>${f.categoria_padrao || '-'}</small></td>
            <td style="text-align:right; padding: 10px;">
                <button class="action-btn" style="color:var(--danger); border:none;" onclick="removerFornecedor(${f.id})">×</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Função para cadastrar via tela de Configuração
async function cadastrarFornecedor() {
    const nome = document.getElementById('novo-forn-nome').value;
    const cat = document.getElementById('novo-forn-cat').value; // Opcional

    if (!nome) return showToast("Digite o nome do fornecedor.", "warning");

    try {
        const res = await fetch('/api/novo_fornecedor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome, categoria: cat })
        });
        const data = await res.json();

        if (data.success) {
            showToast("Fornecedor cadastrado!", "success");
            document.getElementById('novo-forn-nome').value = '';
            carregarFornecedores(); // Atualiza tudo
        } else {
            showToast(data.message, "error");
        }
    } catch (e) {
        showToast("Erro de conexão.", "error");
    }
}

async function removerFornecedor(id) {
    if(!confirm("Remover este fornecedor da lista de sugestões?")) return;

    await fetch('/api/excluir_fornecedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    });
    carregarFornecedores();
}

/* ==========================================================================
   GESTÃO DE USUÁRIOS (ADMIN)
   ========================================================================== */
async function carregarListaUsuarios() {
    const tbody = document.getElementById('tabela-usuarios-config');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:10px;">Carregando...</td></tr>';

    try {
        const res = await fetch('/api/lista_usuarios');
        const lista = await res.json();

        tbody.innerHTML = '';
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        lista.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;">${u.nome}</td>
                <td style="padding:10px;"><code>${u.usuario}</code></td>
                <td style="padding:10px;"><span class="status-badge" style="background:${u.funcao==='Admin'?'#e0e7ff':'#f3f4f6'}; color:${u.funcao==='Admin'?'#3730a3':'#374151'}">${u.funcao}</span></td>
                <td style="padding:10px; text-align:right;">
                    <button class="action-btn" title="Resetar Senha" onclick="abrirModalReset('${u.id}', '${u.nome}')">🔑</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Erro ao carregar usuários.</td></tr>';
    }
}

// Variável global para armazenar quem está sendo editado
let usuarioIdReset = null;

function abrirModalReset(id, nome) {
    usuarioIdReset = id;
    document.getElementById('reset-nome-user').innerText = nome;
    document.getElementById('reset-nova-senha').value = '';
    document.getElementById('modal-reset-senha').classList.remove('hidden');
    setTimeout(() => document.getElementById('reset-nova-senha').focus(), 100);
}

function fecharModalReset() {
    document.getElementById('modal-reset-senha').classList.add('hidden');
    usuarioIdReset = null;
}

async function confirmarResetSenha() {
    const novaSenha = document.getElementById('reset-nova-senha').value;
    if (!novaSenha) return showToast("Digite a nova senha.", "warning");
    if (!usuarioIdReset) return;

    try {
        const res = await fetch('/api/admin_reset_senha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: usuarioIdReset, nova_senha: novaSenha })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, "success");
            fecharModalReset();
        } else {
            showToast(data.message, "error");
        }
    } catch (e) {
        showToast("Erro de conexão.", "error");
    }
}