// --- SIDEBAR TOGGLE ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const body = document.body;
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        body.classList.add('sidebar-closed');
    } else {
        body.classList.remove('sidebar-closed');
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
    const errorBox = document.getElementById('login-error');

    errorBox.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({usuario: user, senha: pass})
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('user-display').innerText = data.nome;
            btn.innerHTML = '✓ Entrando...';
            setTimeout(() => {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-screen').classList.remove('hidden');
                carregarDashboard();
            }, 500);
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Entrar';
        errorBox.style.display = 'block';
        errorBox.innerText = "🔒 Usuário ou senha inválidos";
    }
}

async function fazerLogout() {
    await fetch('/api/logout', {method: 'POST'});
    location.reload();
}
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

    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}
// --- NAVEGAÇÃO ---
function nav(viewId, elementoMenu) {
    document.querySelectorAll('.content > div').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + viewId).classList.remove('hidden');

    if(elementoMenu) {
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        elementoMenu.classList.add('active');
    }

    if(viewId === 'dashboard') carregarDashboard();
    if(viewId === 'lista') carregarLista();
    if(viewId === 'config') carregarConfiguracoes();
}

// --- DASHBOARD ---
let chartM = null;
let chartC = null;

async function carregarDashboard() {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    // 1. CARDS
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('card-pagar-mes').innerText = fmt(data.cards.pagar_mes);
    document.getElementById('card-vencidos-val').innerText = fmt(data.cards.vencidos_val);
    document.getElementById('card-vencidos-qtd').innerText = data.cards.vencidos_qtd;
    document.getElementById('card-proximos-val').innerText = fmt(data.cards.proximos_val);
    document.getElementById('card-proximos-qtd').innerText = data.cards.proximos_qtd;
    document.getElementById('card-pago-mes').innerText = fmt(data.cards.pago_mes);

    // 2. GRÁFICO LINHA (EVOLUÇÃO)
    const ctxM = document.getElementById('chartMes').getContext('2d');
    if(chartM) chartM.destroy();

    let gradient = ctxM.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(49, 130, 206, 0.3)');
    gradient.addColorStop(1, 'rgba(49, 130, 206, 0.0)');

    chartM = new Chart(ctxM, {
        type: 'line',
        data: {
            labels: data.graficos.por_mes.map(d => d.mes),
            datasets: [{
                label: 'Total R$',
                data: data.graficos.por_mes.map(d => d.total),
                borderColor: '#3182ce',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#3182ce',
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

    // 3. GRÁFICO CATEGORIA
    const ctxC = document.getElementById('chartCat').getContext('2d');
    if(chartC) chartC.destroy();
    chartC = new Chart(ctxC, {
        type: 'doughnut',
        data: {
            labels: data.graficos.por_categoria.map(d => d.categoria),
            datasets: [{
                data: data.graficos.por_categoria.map(d => d.total),
                backgroundColor: ['#3182ce', '#e53e3e', '#dd6b20', '#38a169', '#805ad5', '#d53f8c']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}
async function verDetalhes(tipo, titulo) {
    const modal = document.getElementById('modal-detalhes');
    const tbody = document.querySelector('#tabela-modal tbody');
    const tituloEl = document.getElementById('modal-titulo');

    // Mostra carregando...
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

        tbody.innerHTML = ''; // Limpa

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            lista.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.vencimento}</td>
                    <td>${item.descricao} <br><small style="color:#777">${item.categoria}</small></td>
                    <td style="font-weight:bold;">R$ ${parseFloat(item.valor).toFixed(2)}</td>
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

// Fechar modal ao clicar fora
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
        if(!el.value || el.value === "") {
            el.classList.add('input-error');
            err.style.display = 'block';
            valido = false;
        } else {
            el.classList.remove('input-error');
            err.style.display = 'none';
        }
        return el.value;
    };
    validar('boleto-desc', 'err-desc');
    let v = validar('boleto-valor', 'err-valor');
    if(v && formatarValorParaBanco(v) === 0) {
        document.getElementById('boleto-valor').classList.add('input-error');
        valido = false;
    }
    validar('boleto-venc', 'err-venc');
    validar('boleto-cat', 'err-cat');
    return valido;
}

// --- LÓGICA DE BOLETO ---
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
            showToast("Código lido com sucesso!", "success");
        } else {
            showToast("Código inválido ou desconhecido.", "warning");
        }
        if(data.vencimento) document.getElementById('boleto-venc').value = data.vencimento;
    } catch(e) {
        codInput.style.opacity = "1";
        showToast("Erro ao ler código.", "error");
    }
}

async function salvarBoleto() {
    if(!validarFormulario()) {
        showToast("Preencha os campos obrigatórios em vermelho.", "error");
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
            showToast("Lançamento salvo com sucesso!", "success");
            limparFormulario();
        } else {
            showToast("Erro: " + resp.message, "error");
        }
    } catch(e) {
        showToast("Erro de conexão com o servidor.", "error");
    }
}

// --- LISTAGEM E CONFIG ---
// --- VARIÁVEIS GLOBAIS DE PAGINAÇÃO ---
let paginaAtual = 1;
let totalPaginas = 1;

// --- LISTAGEM AVANÇADA ---
async function carregarLista(pagina = 1) {
    paginaAtual = pagina;

    // Pega valores dos filtros
    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status').value;
    const cat = document.getElementById('filtro-cat').value;

    // Monta URL com parâmetros
    const params = new URLSearchParams({
        pagina: paginaAtual,
        busca: busca,
        status: status,
        categoria: cat
    });

    const res = await fetch(`/api/registros?${params}`);
    const data = await res.json();

    // Atualiza controles de paginação
    totalPaginas = data.total_paginas;
    document.getElementById('info-paginas').innerText = `Página ${data.pagina_atual} de ${data.total_paginas || 1}`;
    document.getElementById('btn-ant').disabled = (paginaAtual <= 1);
    document.getElementById('btn-prox').disabled = (paginaAtual >= totalPaginas);

    // Popula Tabela
    const tbody = document.querySelector('#tabela-registros tbody');
    tbody.innerHTML = '';

    if(data.registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    data.registros.forEach(item => {
        // Lógica Visual: Vencido?
        let classeStatus = `status-${item.status}`;
        let textoStatus = item.status;

        if (item.status === 'Pendente') {
            const [d, m, y] = item.vencimento.split('/');
            const dtVenc = new Date(`${y}-${m}-${d}`); // YYYY-MM-DD
            const hoje = new Date();
            hoje.setHours(0,0,0,0); // Zera hora para comparar apenas dia

            if (dtVenc < hoje) {
                classeStatus = 'status-Vencido';
                textoStatus = 'Vencido ⚠️';
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.vencimento}</td>
            <td>${item.descricao}</td>
            <td><small>${item.categoria}</small></td>
            <td style="font-weight:bold">R$ ${parseFloat(item.valor).toFixed(2)}</td>
            <td><span class="${classeStatus} status-badge">${textoStatus}</span></td>
            <td style="text-align: right;">
                <button class="action-btn" title="Editar" onclick='abrirModalEdicao(${JSON.stringify(item)})'>✏️</button>
                ${item.status === 'Pendente' ?
            `<button class="action-btn" title="Marcar Pago" style="color:green" onclick="mudarStatus(${item.id}, 'Pago')">✅</button>` :
            `<button class="action-btn" title="Reabrir" style="color:orange" onclick="mudarStatus(${item.id}, 'Pendente')">↺</button>`}
                <button class="action-btn" title="Excluir" style="color:red" onclick="excluir(${item.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function mudarPagina(delta) {
    const novaPagina = paginaAtual + delta;
    if(novaPagina >= 1 && novaPagina <= totalPaginas) {
        carregarLista(novaPagina);
    }
}

// --- EDIÇÃO (MODAL) ---
function abrirModalEdicao(item) {
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-desc').value = item.descricao;

    // Valor: Formata para R$
    let val = parseFloat(item.valor).toFixed(2).replace('.', ',');
    document.getElementById('edit-valor').value = `R$ ${val}`;

    // Data: Converte DD/MM/YYYY -> YYYY-MM-DD para o input type="date"
    const [d, m, y] = item.vencimento.split('/');
    document.getElementById('edit-venc').value = `${y}-${m}-${d}`;

    document.getElementById('edit-cat').value = item.categoria;
    document.getElementById('edit-status').value = item.status;

    document.getElementById('modal-editar').classList.remove('hidden');
}

function fecharModalEdicao() {
    document.getElementById('modal-editar').classList.add('hidden');
}

async function salvarEdicao() {
    // Formata Data YYYY-MM-DD -> DD/MM/YYYY (opcional, o backend já trata, mas bom garantir)
    // Vamos mandar como está e o backend trata
    const dados = {
        id: document.getElementById('edit-id').value,
        descricao: document.getElementById('edit-desc').value,
        valor: formatarValorParaBanco(document.getElementById('edit-valor').value),
        vencimento: document.getElementById('edit-venc').value,
        categoria: document.getElementById('edit-cat').value,
        status: document.getElementById('edit-status').value
    };

    const res = await fetch('/api/editar', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(dados)
    });

    if((await res.json()).success) {
        showToast("Registro atualizado!", "success");
        fecharModalEdicao();
        carregarLista(paginaAtual);
    } else {
        showToast("Erro ao editar registro.", "error");
    }
}

async function mudarStatus(id, novoStatus) {
    await fetch('/api/atualizar_status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: id, status: novoStatus})
    });
    carregarLista();
}

async function excluir(id) {
    if(!confirm("Tem certeza que deseja excluir este registro?")) return;

    try {
        await fetch('/api/excluir', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id})
        });
        showToast("Registro excluído.", "warning");
        carregarLista(paginaAtual);
    } catch(e) {
        showToast("Erro ao excluir.", "error");
    }
}

async function carregarConfiguracoes() {
    const res = await fetch('/api/dados_usuario');
    const data = await res.json();
    if(data.login) {
        document.getElementById('conf-login').value = data.login;
        document.getElementById('conf-nome').value = data.nome;
    }
}

async function salvarConfiguracoes() {
    const dados = {
        novo_login: document.getElementById('conf-login').value,
        novo_nome: document.getElementById('conf-nome').value,
        nova_senha: document.getElementById('conf-senha').value
    };
    const res = await fetch('/api/alterar_perfil', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(dados)
    });
    const resp = await res.json();
    if(resp.success) {
        alert("Dados atualizados!");
        document.getElementById('user-display').innerText = dados.novo_nome;
        document.getElementById('conf-senha').value = "";
    } else {
        alert("Erro: " + resp.message);
    }
}