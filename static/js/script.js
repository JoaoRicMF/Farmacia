// --- SISTEMA DE NOTIFICAÇÕES (TOAST) ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');

    // Cria elemento
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if(type === 'success') icon = '✅';
    if(type === 'error') icon = '❌';
    if(type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    // Remove após 3.5 segundos
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// --- SIDEBAR TOGGLE (RESPONSIVO) ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    sidebar.classList.toggle('active');

    if (sidebar.classList.contains('active')) {
        if(overlay) overlay.style.display = 'block';
    } else {
        if(overlay) overlay.style.display = 'none';
    }
}

// --- LOGIN ---
function toggleSenha() {
    const campo = document.getElementById('login-pass');
    const icon = document.querySelector('.toggle-pass');
    if (campo.type === "password") {
        campo.type = "text";
        icon.innerText = "🔒";
    } else {
        campo.type = "password";
        icon.innerText = "👁️";
    }
}

async function fazerLogin() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const btn = document.getElementById('btn-entrar');

    btn.disabled = true;
    btn.innerHTML = 'Verificando...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({usuario: user, senha: pass})
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('user-display').innerText = data.nome;
            sessionStorage.setItem('user_role', data.funcao); // Guarda permissão
            btn.innerHTML = '✓ Sucesso!';

            showToast(`Bem-vindo, ${data.nome}!`, "success");

            setTimeout(() => {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-screen').classList.remove('hidden');
                carregarDashboard();
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

async function fazerLogout() {
    await fetch('/api/logout', {method: 'POST'});
    location.reload();
}

// --- LOGOUT CONFIRMAÇÃO ---
function confirmarLogout() {
    document.getElementById('modal-logout').classList.remove('hidden');
}
function fecharModalLogout() {
    document.getElementById('modal-logout').classList.add('hidden');
}
async function fazerLogoutReal() {
    await fetch('/api/logout', {method: 'POST'});
    location.reload();
}

// --- NAVEGAÇÃO ---
function nav(viewId, elementoMenu) {
    document.querySelectorAll('.content > div').forEach(el => {
        if(!el.id.startsWith('modal')) el.classList.add('hidden');
    });

    const view = document.getElementById('view-' + viewId);
    if(view) view.classList.remove('hidden');

    if(elementoMenu) {
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        elementoMenu.classList.add('active');
    }

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 1024 && sidebar.classList.contains('active')) {
        toggleSidebar();
    }

    if(viewId === 'dashboard') { carregarDashboard(); verificarPermissoesUI(); }
    if(viewId === 'lista') carregarLista(1);
    if(viewId === 'logs') carregarLogs();
    if(viewId === 'config') carregarConfiguracoes();
}

function verificarPermissoesUI() {
    const role = sessionStorage.getItem('user_role');
    const adminItems = document.querySelectorAll('.admin-only');

    if (role === 'Admin') {
        adminItems.forEach(el => el.classList.remove('hidden'));
        const roleEl = document.getElementById('user-role');
        if(roleEl) roleEl.innerText = "Administrador";
    } else {
        adminItems.forEach(el => el.classList.add('hidden'));
        const roleEl = document.getElementById('user-role');
        if(roleEl) roleEl.innerText = "Operador";
    }
}

// --- DASHBOARD ---
let chartM = null;
let chartC = null;
let calendarInstance = null;

async function carregarDashboard() {
    try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();

        // Cards
        const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        if(document.getElementById('card-pagar-mes'))
            document.getElementById('card-pagar-mes').innerText = fmt(data.cards.pagar_mes);

        if(document.getElementById('card-vencidos-val'))
            document.getElementById('card-vencidos-val').innerText = fmt(data.cards.vencidos_val);
        document.getElementById('card-vencidos-qtd').innerText = data.cards.vencidos_qtd;

        if(document.getElementById('card-proximos-val'))
            document.getElementById('card-proximos-val').innerText = fmt(data.cards.proximos_val);
        document.getElementById('card-proximos-qtd').innerText = data.cards.proximos_qtd;

        if(document.getElementById('card-pago-mes'))
            document.getElementById('card-pago-mes').innerText = fmt(data.cards.pago_mes);

        // Gráficos
        const ctxM = document.getElementById('chartMes').getContext('2d');
        if(chartM) chartM.destroy();

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
                    pointBorderColor: '#2563eb',
                    pointRadius: 4,
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

        const ctxC = document.getElementById('chartCat').getContext('2d');
        if(chartC) chartC.destroy();
        chartC = new Chart(ctxC, {
            type: 'doughnut',
            data: {
                labels: data.graficos.por_categoria.map(d => d.categoria),
                datasets: [{
                    data: data.graficos.por_categoria.map(d => d.total),
                    backgroundColor: ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#64748b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } },
                cutout: '70%'
            }
        });

        // Inicia Calendário
        initCalendar();

    } catch (e) {
        console.error("Erro dashboard:", e);
    }
}

// --- CALENDÁRIO ---
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;

    if (calendarInstance) {
        calendarInstance.refetchEvents();
        return;
    }

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        buttonText: { today: 'Hoje', month: 'Mês', list: 'Lista' },
        events: '/api/calendario',
        eventClick: function(info) {
            const evt = info.event;
            showToast(`📅 ${evt.title} (${evt.extendedProps.status})`, "success");
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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';

    modal.classList.remove('hidden');

    try {
        const res = await fetch('/api/detalhes_card', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({tipo: tipo})
        });
        const lista = await res.json();

        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhum registro encontrado.</td></tr>';
        } else {
            lista.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.vencimento}</td>
                    <td>${item.descricao} <br><small style="color:#64748b">${item.categoria}</small></td>
                    <td style="font-weight:bold; color:#1e293b;">R$ ${parseFloat(item.valor).toFixed(2)}</td>
                    <td><span class="status-badge status-${item.status}">${item.status}</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Erro ao carregar dados.</td></tr>';
    }
}

function fecharModal() {
    document.getElementById('modal-detalhes').classList.add('hidden');
}
document.getElementById('modal-detalhes').addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
});

// --- FORMULÁRIO E MÁSCARAS ---
function mascaraMoeda(i) {
    let v = i.value.replace(/\D/g,'');
    v = (v/100).toFixed(2) + '';
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
    document.getElementById('boleto-cod').value = "";
    document.getElementById('boleto-desc').value = "";
    document.getElementById('boleto-valor').value = "";
    document.getElementById('boleto-venc').value = "";
    document.getElementById('boleto-cat').value = "";
    document.getElementById('boleto-status').value = "Pendente";

    document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function validarFormulario() {
    let valido = true;
    const validar = (id, idErro) => {
        const el = document.getElementById(id);
        const err = document.getElementById(idErro);
        if (!el || el.offsetParent === null) return null;

        if(!el.value || el.value === "") {
            el.classList.add('input-error');
            if(err) err.style.display = 'block';
            valido = false;
        } else {
            el.classList.remove('input-error');
            if(err) err.style.display = 'none';
        }
        return el.value;
    };

    validar('boleto-desc', 'err-desc');
    let v = validar('boleto-valor', 'err-valor');
    if(v && formatarValorParaBanco(v) === 0) {
        const el = document.getElementById('boleto-valor');
        if(el) el.classList.add('input-error');
        valido = false;
    }
    validar('boleto-venc', 'err-venc');
    validar('boleto-cat', 'err-cat');
    return valido;
}

// --- BOLETOS (LER E SALVAR) ---
async function lerCodigoBarras() {
    const codInput = document.getElementById('boleto-cod');
    const cod = codInput.value;
    if(!cod) return;

    codInput.style.opacity = "0.5";

    try {
        const res = await fetch('/api/ler_codigo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({codigo: cod})
        });
        const data = await res.json();

        codInput.style.opacity = "1";

        if(data.valor) {
            let valF = data.valor.toFixed(2).replace('.', ',');
            document.getElementById('boleto-valor').value = `R$ ${valF}`;
            mascaraMoeda(document.getElementById('boleto-valor'));
            showToast("Código lido!", "success");
        } else {
            showToast("Código lido (sem valor definido).", "warning");
        }
        if(data.vencimento) document.getElementById('boleto-venc').value = data.vencimento;
    } catch(e) {
        codInput.style.opacity = "1";
        showToast("Erro ao processar código.", "error");
    }
}

async function salvarBoleto() {
    if(!validarFormulario()) {
        showToast("Preencha os campos obrigatórios.", "error");
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
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        const resp = await res.json();

        if(resp.success) {
            showToast("Lançamento salvo!", "success");
            limparFormulario();
        } else {
            showToast("Erro: " + resp.message, "error");
        }
    } catch(e) { showToast("Erro de conexão.", "error"); }
}

// --- LISTAGEM ---
let paginaAtual = 1;
let totalPaginas = 1;

async function carregarLista(pagina = 1) {
    paginaAtual = pagina;
    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status').value;
    const cat = document.getElementById('filtro-cat').value;

    const params = new URLSearchParams({
        pagina: paginaAtual,
        busca: busca,
        status: status,
        categoria: cat
    });

    try {
        const res = await fetch(`/api/registros?${params}`);
        const data = await res.json();

        totalPaginas = data.total_paginas;
        document.getElementById('info-paginas').innerText = `Pág. ${data.pagina_atual} de ${data.total_paginas || 1}`;
        document.getElementById('btn-ant').disabled = (paginaAtual <= 1);
        document.getElementById('btn-prox').disabled = (paginaAtual >= totalPaginas);

        const tbody = document.querySelector('#tabela-registros tbody');
        tbody.innerHTML = '';

        if(data.registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #64748b;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        data.registros.forEach(item => {
            let classeStatus = `status-${item.status}`;
            let textoStatus = item.status;

            // Verifica vencimento (DD/MM/YYYY) vs Hoje
            if (item.status === 'Pendente') {
                const parts = item.vencimento.split('/');
                if(parts.length === 3) {
                    const dtVenc = new Date(parts[2], parts[1]-1, parts[0]);
                    const hoje = new Date();
                    hoje.setHours(0,0,0,0);
                    if (dtVenc < hoje) {
                        classeStatus = 'status-Vencido';
                        textoStatus = 'Vencido';
                    }
                }
            }

            const tr = document.createElement('tr');
            const itemStr = JSON.stringify(item).replace(/"/g, '&quot;');
            const btnExcluir = data.perm_excluir ? `<button class="action-btn" title="Excluir" style="color:#ef4444" onclick="excluir(${item.id})">🗑️</button>` : '';

            tr.innerHTML = `
                <td style="font-family:monospace;">${item.vencimento}</td>
                <td style="font-weight:500;">${item.descricao}</td>
                <td><small style="background:#f1f5f9;padding:4px 8px;border-radius:4px;">${item.categoria}</small></td>
                <td style="font-weight:700;">R$ ${parseFloat(item.valor).toFixed(2)}</td>
                <td><span class="${classeStatus} status-badge">${textoStatus}</span></td>
                <td style="text-align:right;">
                    <button class="action-btn" title="Editar" onclick="abrirModalEdicao(${itemStr})">✏️</button>
                    ${item.status === 'Pendente' ?
                `<button class="action-btn" title="Pagar" style="color:#059669" onclick="mudarStatus(${item.id}, 'Pago')">✅</button>` :
                `<button class="action-btn" title="Reabrir" style="color:#d97706" onclick="mudarStatus(${item.id}, 'Pendente')">↺</button>`}
                    ${btnExcluir}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        console.error(e);
        showToast("Erro ao carregar lista.", "error");
    }
}

function mudarPagina(delta) {
    const novaPagina = paginaAtual + delta;
    if(novaPagina >= 1 && novaPagina <= totalPaginas) {
        carregarLista(novaPagina);
    }
}

async function mudarStatus(id, novoStatus) {
    await fetch('/api/atualizar_status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: id, status: novoStatus})
    });
    showToast(`Status alterado para ${novoStatus}`, "success");
    carregarLista(paginaAtual);
}

async function excluir(id) {
    if(!confirm("Excluir permanentemente?")) return;
    try {
        const res = await fetch('/api/excluir', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id})
        });
        const data = await res.json();
        if(data.success) {
            showToast("Registro excluído.", "warning");
            carregarLista(paginaAtual);
        } else {
            showToast(data.message, "error");
        }
    } catch(e) { showToast("Erro ao excluir.", "error"); }
}

// --- EDIÇÃO ---
function abrirModalEdicao(item) {
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-desc').value = item.descricao;

    let val = parseFloat(item.valor).toFixed(2).replace('.', ',');
    document.getElementById('edit-valor').value = `R$ ${val}`;

    // Converte DD/MM/YYYY para YYYY-MM-DD para input date
    const parts = item.vencimento.split('/');
    if(parts.length === 3) {
        document.getElementById('edit-venc').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    document.getElementById('edit-cat').value = item.categoria;
    document.getElementById('edit-status').value = item.status;
    document.getElementById('modal-editar').classList.remove('hidden');
}

function fecharModalEdicao() {
    document.getElementById('modal-editar').classList.add('hidden');
}
document.getElementById('modal-editar').addEventListener('click', function(e) {
    if (e.target === this) fecharModalEdicao();
});

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
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        if((await res.json()).success) {
            showToast("Atualizado!", "success");
            fecharModalEdicao();
            carregarLista(paginaAtual);
        } else {
            showToast("Erro ao editar.", "error");
        }
    } catch(e) { showToast("Erro de conexão.", "error"); }
}

// --- LOGS ---
async function carregarLogs() {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    const tbody = document.querySelector('#tabela-logs tbody');
    tbody.innerHTML = '';
    logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${l.data_hora}</td><td><b>${l.usuario}</b></td><td>${l.acao}</td><td><small>${l.detalhes}</small></td>`;
        tbody.appendChild(tr);
    });
}

// --- CONFIGURAÇÕES ---
async function carregarConfiguracoes() {
    try {
        const res = await fetch('/api/dados_usuario');
        const data = await res.json();
        if(data.login) {
            document.getElementById('conf-login').value = data.login;
            document.getElementById('conf-nome').value = data.nome;
        }
    } catch(e) { }
}

async function salvarConfiguracoes() {
    const dados = {
        novo_login: document.getElementById('conf-login').value,
        novo_nome: document.getElementById('conf-nome').value,
        nova_senha: document.getElementById('conf-senha').value
    };
    try {
        const res = await fetch('/api/alterar_perfil', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        if((await res.json()).success) {
            showToast("Perfil atualizado!", "success");
            document.getElementById('user-display').innerText = dados.novo_nome;
            document.getElementById('conf-senha').value = "";
        } else {
            showToast("Erro ao atualizar.", "error");
        }
    } catch(e) { showToast("Erro de conexão.", "error"); }
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

// --- NAVEGAÇÃO COM ENTER (NOVO) ---
document.addEventListener("DOMContentLoaded", () => {
    // Array com IDs dos campos na ordem desejada
    const camposLancamento = [
        'boleto-cod',
        'boleto-desc',
        'boleto-valor',
        'boleto-venc',
        'boleto-cat',
        'boleto-status'
    ];

    camposLancamento.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();

                    // Se for o último campo (status), salva
                    if (index === camposLancamento.length - 1) {
                        salvarBoleto();
                    } else {
                        // Caso contrário, foca no próximo
                        const proximoId = camposLancamento[index + 1];
                        const proximoEl = document.getElementById(proximoId);
                        if (proximoEl) proximoEl.focus();
                    }
                }
            });
        }
    });
});