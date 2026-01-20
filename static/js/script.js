// --- SISTEMA DE NOTIFICAÇÕES (TOAST) ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// --- UTILS: SIDEBAR ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.toggle('active');

    if (sidebar && sidebar.classList.contains('active')) {
        if (overlay) overlay.style.display = 'block';
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

// --- UTILS: HTML DO LOADER ---
// Usado para injetar nas tabelas durante o carregamento
const LOADER_HTML = `
    <tr class="loading-row">
        <td colspan="100%" style="text-align:center; padding: 40px;">
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        </td>
    </tr>
`;

// --- LOGIN & SESSÃO (PERSISTÊNCIA) ---
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

                // Navega para dashboard e adiciona ao histórico
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

// Verifica se já existe sessão ativa ao recarregar a página (F5)
async function verificarSessao() {
    try {
        const res = await fetch('/api/dados_usuario');
        const data = await res.json();

        if (data.login) {
            // Utilizador logado no backend, restaura UI
            document.getElementById('user-display').innerText = data.nome;

            // Esconde login e mostra app
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');

            // Recupera a view do URL (ex: #lista) ou vai para dashboard
            const hash = window.location.hash.replace('#', '') || 'dashboard';

            // Chama nav com addToHistory=false para não duplicar o estado atual
            nav(hash, null, false);
        }
    } catch (e) {
        // Se der erro ou não estiver logado, permanece na tela de login
        console.log("Sem sessão ativa ou erro de conexão.");
    }
}

async function fazerLogout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/'; // Recarrega a página limpa
}

function confirmarLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.remove('hidden');
}
function fecharModalLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.add('hidden');
}
async function fazerLogoutReal() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

// --- NAVEGAÇÃO & HISTORY API (SPA) ---

// Escuta o botão "Voltar" do navegador
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
        nav(event.state.view, null, false);
    } else {
        // Se o histórico estiver vazio/inicial, assume dashboard
        nav('dashboard', null, false);
    }
});

function nav(viewId, elementoMenu, addToHistory = true) {
    // 1. Esconde todas as views
    document.querySelectorAll('.content > div').forEach(el => {
        if (!el.id.startsWith('modal')) el.classList.add('hidden');
    });

    // 2. Mostra a view correta
    const view = document.getElementById('view-' + viewId);
    if (view) {
        view.classList.remove('hidden');
    } else {
        // Se a view não existir (URL inválida), volta pro dashboard
        nav('dashboard', null, false);
        return;
    }

    // 3. Atualiza Menu Ativo
    // Se não foi clicado diretamente (ex: via URL ou botão voltar), busca o elemento do menu
    if (!elementoMenu) {
        elementoMenu = document.querySelector(`.menu-item[onclick*="'${viewId}'"]`);
    }

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (elementoMenu) {
        elementoMenu.classList.add('active');
    }

    // 4. Atualiza URL e Histórico (History API)
    if (addToHistory) {
        history.pushState({ view: viewId }, '', `#${viewId}`);
    }

    // 5. Mobile: fecha sidebar se estiver aberta
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 1024 && sidebar && sidebar.classList.contains('active')) {
        toggleSidebar();
    }

    // 6. Lógica Específica de Carregamento por Tela
    if (viewId === 'dashboard') {
        setTimeout(() => carregarDashboard(), 50); // Delay mínimo para renderização
        verificarPermissoesUI();
    }
    if (viewId === 'lista') carregarLista(1);
    if (viewId === 'logs') carregarLogs();
    if (viewId === 'config') carregarConfiguracoes();
    if (viewId === 'fluxo') {
        const inputMes = document.getElementById('filtro-mes-fluxo');
        if (!inputMes.value) {
            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            inputMes.value = `${ano}-${mes}`;
        }
        carregarFluxo();
    }
}

function verificarPermissoesUI() {
    const role = sessionStorage.getItem('user_role');
    const adminItems = document.querySelectorAll('.admin-only');

    if (role === 'Admin') {
        adminItems.forEach(el => el.classList.remove('hidden'));
        const roleEl = document.getElementById('user-role');
        if (roleEl) roleEl.innerText = "Administrador";
    } else {
        adminItems.forEach(el => el.classList.add('hidden'));
        const roleEl = document.getElementById('user-role');
        if (roleEl) roleEl.innerText = "Operador";
    }
}

// --- DASHBOARD ---
let chartM = null;
let chartC = null;
let calendarInstance = null;

function filtrarDashboard(periodo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    carregarDashboard(periodo);
}

function preFiltrarLista(status) {
    // Seta o valor no select
    const select = document.getElementById('filtro-status');
    if(select) select.value = status;

    // Força o recarregamento da lista com o novo filtro
    carregarLista(1);

    // Feedback visual
    showToast(`Filtrando por: ${status}`, "success");
}

async function carregarDashboard(periodo = null) {
    // 1. PERSISTÊNCIA DE PERÍODO
    // Se o periodo não foi passado, tenta pegar do localStorage, senão usa '7d'
    if (!periodo) {
        periodo = localStorage.getItem('dashboard_periodo') || '7d';
    }
    // Salva a escolha atual
    localStorage.setItem('dashboard_periodo', periodo);

    // Atualiza botões ativos na UI
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        // Verifica se o onclick do botão contém o período atual
        if(b.getAttribute('onclick').includes(`'${periodo}'`)) {
            b.classList.add('active');
        }
    });

    const containerCharts = document.getElementById('charts-container');
    const containerEmpty = document.getElementById('dashboard-empty-state');

    // Loader visual (opacidade)
    if (containerCharts) containerCharts.style.opacity = '0.5';

    try {
        const res = await fetch(`/api/dashboard?periodo=${periodo}`);
        const data = await res.json();

        // Atualiza Cards com Quantidades
        if (data.cards) {
            const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

            setTxt('card-pagar-mes', fmt(data.cards.pagar_mes));
            setTxt('card-vencidos-val', fmt(data.cards.vencidos_val));
            setTxt('card-vencidos-qtd', `${data.cards.vencidos_qtd} un.`); // Ex: 5 un.
            setTxt('card-proximos-val', fmt(data.cards.proximos_val));
            setTxt('card-proximos-qtd', `${data.cards.proximos_qtd} un.`);
            setTxt('card-pago-mes', fmt(data.cards.pago_mes));
        }

        // 2. ESTADO VAZIO INTELIGENTE
        const temDados = data.graficos.por_mes && data.graficos.por_mes.length > 0;

        if (!temDados) {
            // Esconde gráficos, mostra Empty State
            if (containerCharts) containerCharts.classList.add('hidden');
            if (containerEmpty) containerEmpty.classList.remove('hidden');
        } else {
            // Mostra gráficos, esconde Empty State
            if (containerCharts) {
                containerCharts.classList.remove('hidden');
                containerCharts.style.opacity = '1';
            }
            if (containerEmpty) containerEmpty.classList.add('hidden');

            // Renderiza Gráficos (Código existente...)
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
                        labels: data.graficos.por_mes.map(d => d.mes),
                        datasets: [{
                            label: 'Total R$',
                            data: data.graficos.por_mes.map(d => d.total),
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
                        scales: {
                            y: { beginAtZero: true, grid: { borderDash: [5, 5], color: '#e2e8f0' } },
                            x: { grid: { display: false } }
                        }
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
                        labels: data.graficos.por_categoria.map(d => d.categoria),
                        datasets: [{
                            data: data.graficos.por_categoria.map(d => d.total),
                            backgroundColor: ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'right' } },
                        cutout: '70%'
                    }
                });
            }
        }
    } catch (e) {
        console.error("Erro no dashboard:", e);
    }
}

// --- CALENDÁRIO ---
function toggleCalendarSection() {
    const wrapper = document.getElementById('calendar-wrapper');
    const header = document.querySelector('.toggle-header');

    wrapper.classList.toggle('show');
    header.classList.toggle('open');

    if (wrapper.classList.contains('show')) {
        setTimeout(() => {
            initCalendar();
        }, 50);
    }
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendarInstance) {
        calendarInstance.updateSize();
        calendarInstance.refetchEvents();
        return;
    }

    if (typeof FullCalendar === 'undefined') return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        buttonText: { today: 'Hoje', month: 'Mês', list: 'Lista' },
        events: '/api/calendario',
        eventClick: function (info) {
            showToast(`📅 ${info.event.title}`, "success");
        }
    });

    calendarInstance.render();
}

// --- MODAL DETALHES ---
async function verDetalhes(tipo, titulo) {
    const modal = document.getElementById('modal-detalhes');
    const tbody = document.querySelector('#tabela-modal tbody');
    const tituloEl = document.getElementById('modal-titulo');

    tituloEl.innerText = titulo;

    // LOADER na tabela do modal
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
                tr.innerHTML = `
                    <td>${venc}</td>
                    <td></td> 
                    <td style="font-weight:bold;">R$ ${valor}</td>
                    <td><span class="status-badge status-${status}">${status}</span></td>
                `;
                tr.children[1].textContent = desc; // Proteção XSS
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Erro ao carregar.</td></tr>';
        console.error(e);
    }
}

function fecharModal() {
    const m = document.getElementById('modal-detalhes');
    if (m) m.classList.add('hidden');
}
const mDetalhes = document.getElementById('modal-detalhes');
if (mDetalhes) mDetalhes.addEventListener('click', function (e) { if (e.target === this) fecharModal(); });


// --- FORMULÁRIO E MÁSCARAS ---
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

function limparFormulario() {
    const ids = ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat', 'boleto-status'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'boleto-status') el.value = "Pendente";
            else el.value = "";
            el.classList.remove('input-error');
        }
    });
    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
}

function validarFormulario() {
    let valido = true;
    const validar = (id, idErro) => {
        const el = document.getElementById(id);
        const err = document.getElementById(idErro);
        if (!el || el.offsetParent === null) return null;

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
        const el = document.getElementById('boleto-valor');
        if (el) el.classList.add('input-error');
        valido = false;
    }
    validar('boleto-venc', 'err-venc');
    return valido;
}

// --- BOLETOS ---
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
            document.getElementById('boleto-valor').value = `R$ ${valF}`;
            mascaraMoeda(document.getElementById('boleto-valor'));
            showToast("Código lido!", "success");
        }
        if (data.vencimento) document.getElementById('boleto-venc').value = data.vencimento;
    } catch (e) {
        codInput.style.opacity = "1";
        showToast("Erro código de barras.", "error");
    }
}

async function salvarBoleto() {
    if (!validarFormulario()) {
        showToast("Preencha os campos.", "error");
        return;
    }
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
            showToast("Lançamento salvo!", "success");
            limparFormulario();
        } else {
            showToast("Erro: " + resp.message, "error");
        }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

// --- LISTAGEM ---
let paginaAtual = 1;
let totalPaginas = 1;

async function carregarLista(pagina = 1) {
    paginaAtual = pagina;
    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status').value;
    const cat = document.getElementById('filtro-cat').value;

    const tbody = document.querySelector('#tabela-registros tbody');
    // LOADER: Injeta o HTML do loader
    tbody.innerHTML = LOADER_HTML;

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

        data.registros.forEach(item => {
            try {
                let classeStatus = `status-${item.status}`;
                let textoStatus = item.status || 'Desconhecido';
                let valorFmt = '0,00';

                if (item.valor) valorFmt = parseFloat(item.valor).toFixed(2).replace('.', ',');

                // Lógica de Vencimento
                if (item.status === 'Pendente' && item.vencimento) {
                    const parts = item.vencimento.split('/');
                    if (parts.length === 3) {
                        const dtVenc = new Date(parts[2], parts[1] - 1, parts[0]);
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0);
                        if (dtVenc < hoje) {
                            classeStatus = 'status-Vencido';
                            textoStatus = 'Vencido';
                        }
                    }
                }

                const tr = document.createElement('tr');
                const itemSafe = JSON.stringify(item).replace(/"/g, '&quot;');
                const btnExcluir = data.perm_excluir ? `<button class="action-btn" title="Excluir" style="color:#ef4444" onclick="excluir(${item.id})">🗑️</button>` : '';

                tr.innerHTML = `
                    <td style="font-family:monospace;">${item.vencimento || '--'}</td>
                    <td style="font-weight:500;"></td>
                    <td><small style="background:#f1f5f9;padding:4px 8px;border-radius:4px;">${item.categoria || 'Geral'}</small></td>
                    <td style="font-weight:700;">R$ ${valorFmt}</td>
                    <td><span class="${classeStatus} status-badge">${textoStatus}</span></td>
                    <td style="text-align:right;">
                        <button class="action-btn" title="Editar" onclick="abrirModalEdicao(${itemSafe})">✏️</button>
                        ${item.status === 'Pendente' ?
                    `<button class="action-btn" title="Pagar" style="color:#059669" onclick="mudarStatus(${item.id}, 'Pago')">✅</button>` :
                    `<button class="action-btn" title="Reabrir" style="color:#d97706" onclick="mudarStatus(${item.id}, 'Pendente')">↺</button>`}
                        ${btnExcluir}
                    </td>
                `;
                tr.children[1].textContent = item.descricao || 'Sem Descrição';
                tbody.appendChild(tr);
            } catch (errInner) {
                console.error("Erro render linha:", errInner);
            }
        });
    } catch (e) {
        console.error("Erro lista:", e);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Erro de conexão.</td></tr>';
    }
}

function mudarPagina(delta) {
    const novaPagina = paginaAtual + delta;
    if (novaPagina >= 1 && novaPagina <= totalPaginas) {
        carregarLista(novaPagina);
    }
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
        if (d.success) {
            showToast("Registro excluído.", "warning");
            carregarLista(paginaAtual);
        } else {
            showToast(d.message, "error");
        }
    } catch (e) { showToast("Erro exclusão.", "error"); }
}

// --- EDIÇÃO ---
function abrirModalEdicao(item) {
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-desc').value = item.descricao;

    let val = item.valor ? parseFloat(item.valor).toFixed(2).replace('.', ',') : '0,00';
    document.getElementById('edit-valor').value = `R$ ${val}`;

    if (item.vencimento) {
        const parts = item.vencimento.split('/');
        if (parts.length === 3) {
            document.getElementById('edit-venc').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    document.getElementById('edit-cat').value = item.categoria || 'Outros';
    document.getElementById('edit-status').value = item.status || 'Pendente';

    const m = document.getElementById('modal-editar');
    if (m) m.classList.remove('hidden');
}

function fecharModalEdicao() {
    const m = document.getElementById('modal-editar');
    if (m) m.classList.add('hidden');
}
const mEdit = document.getElementById('modal-editar');
if (mEdit) mEdit.addEventListener('click', function (e) { if (e.target === this) fecharModalEdicao(); });

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
        } else {
            showToast("Erro editar.", "error");
        }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

// --- LOGS ---
async function carregarLogs() {
    const tbody = document.querySelector('#tabela-logs tbody');
    // LOADER
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

// --- FLUXO DE CAIXA ---
async function carregarFluxo() {
    const inputMes = document.getElementById('filtro-mes-fluxo').value;
    if (!inputMes) return;
    const [ano, mes] = inputMes.split('-');

    const tbody = document.querySelector('#tabela-fluxo tbody');
    // LOADER
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

                tr.innerHTML = `
                    <td><small>${dataFmt}</small></td>
                    <td></td>
                    <td><span style="font-size:0.75rem; background:var(--bg-body); padding:2px 6px; border-radius:4px;">${item.categoria}</span></td>
                    <td style="color:${cor}; font-weight:bold;">${sinal} ${fmt(item.valor)}</td>
                    <td style="text-align:right;">${btnExcluir}</td>
                `;
                tr.children[1].textContent = item.descricao;
                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
}

function filtrarFluxo(tipo) {
    const linhas = document.querySelectorAll('#tabela-fluxo tbody tr');
    let cont = 0;

    linhas.forEach(tr => {
        const tipoLinha = tr.getAttribute('data-fluxo-tipo');
        if (tipo === 'todos' || tipoLinha === tipo) {
            tr.style.display = '';
            cont++;
        } else {
            tr.style.display = 'none';
        }
    });

    let msg = "Exibindo todos os registros.";
    if (tipo === 'entrada') msg = "Exibindo apenas Entradas.";
    if (tipo === 'saida') msg = "Exibindo apenas Saídas.";

    showToast(msg, "success");
}

// --- FLUXO: CRUD ---
async function salvarSaidaCaixa() {
    const desc = document.getElementById('sai-desc').value;
    const valorStr = document.getElementById('sai-valor').value;
    const forma = document.getElementById('sai-forma').value;
    const dataSai = document.getElementById('sai-data').value;

    if (!valorStr || !dataSai || !desc) {
        showToast("Preencha descrição, valor e data.", "warning");
        return;
    }
    const valor = formatarValorParaBanco(valorStr);

    try {
        const res = await fetch('/api/nova_saida_caixa', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descricao: desc,
                valor: valor,
                forma: forma,
                data: dataSai
            })
        });
        if ((await res.json()).success) {
            showToast("Saída registrada!", "success");
            document.getElementById('sai-valor').value = '';
            document.getElementById('sai-desc').value = '';
            carregarFluxo();
        } else { showToast("Erro ao salvar.", "error"); }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

async function excluirItemFluxo(id, tipo) {
    if (!confirm("Excluir este lançamento?")) return;

    let url = '';
    if (tipo === 'entrada') url = '/api/excluir_entrada';
    if (tipo === 'saida_caixa') url = '/api/excluir_saida_caixa';

    if (!url) return;

    try {
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        if ((await res.json()).success) {
            showToast("Removido com sucesso.", "success");
            carregarFluxo();
        } else { showToast("Erro ao excluir.", "error"); }
    } catch (e) { showToast("Erro.", "error"); }
}

async function salvarEntradaCaixa() {
    const valorStr = document.getElementById('ent-valor').value;
    const forma = document.getElementById('ent-forma').value;
    let dataEnt = document.getElementById('ent-data').value;

    const valor = formatarValorParaBanco(valorStr);

    try {
        const res = await fetch('/api/nova_entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                valor: valor,
                forma: forma,
                data: dataEnt
            })
        });

        const json = await res.json();
        if (json.success) {
            showToast("Entrada registrada!", "success");
            document.getElementById('ent-valor').value = '';
            carregarFluxo();
        } else {
            showToast("Erro ao salvar.", "error");
        }
    } catch (e) {
        showToast("Erro de conexão.", "error");
    }
}

async function excluirEntrada(id) {
    if (!confirm("Tem certeza que deseja apagar esta entrada?")) return;
    try {
        const res = await fetch('/api/excluir_entrada', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        if ((await res.json()).success) {
            showToast("Entrada removida.", "success");
            carregarFluxo();
        } else {
            showToast("Permissão negada ou erro.", "error");
        }
    } catch (e) { showToast("Erro.", "error"); }
}

function baixarExcelFluxo() {
    const inputMes = document.getElementById('filtro-mes-fluxo').value;
    if (!inputMes) {
        showToast("Selecione um mês/ano.", "warning");
        return;
    }
    const [ano, mes] = inputMes.split('-');
    window.location.href = `/api/exportar_fluxo_excel?mes=${mes}&ano=${ano}`;
}

// --- CONFIG ---
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
        } else {
            showToast("Erro salvar.", "error");
        }
    } catch (e) { showToast("Erro conexão.", "error"); }
}

// --- DARK MODE ---
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
if (localStorage.getItem('theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    document.getElementById('text-theme').innerText = "Modo Claro";
}

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Tenta restaurar sessão e estado da página (Persistence)
    verificarSessao();

    // 2. Define datas padrão (Hoje)
    const hoje = new Date().toISOString().split('T')[0];
    const i1 = document.getElementById('ent-data');
    const i2 = document.getElementById('sai-data');
    if (i1) i1.value = hoje;
    if (i2) i2.value = hoje;

    // 3. Listener Enter para Formulário
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