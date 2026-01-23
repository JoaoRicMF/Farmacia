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
    // Atualiza botões de filtro
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btnAtivo = document.querySelector(`.filter-btn[onclick*="'${periodo}'"]`);
    if (btnAtivo) btnAtivo.classList.add('active');

    const dados = await apiRequest(`/dashboard.php?periodo=${periodo}`);
    if (!dados) return;

    // Atualiza Cards
    const atualizarCard = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    };

    if (dados.cards) {
        atualizarCard('card-pagar-mes', formatarMoedaBRL(dados.cards.pagar_mes));
        atualizarCard('card-pago-mes', formatarMoedaBRL(dados.cards.pago_mes));
        atualizarCard('card-vencidos-val', formatarMoedaBRL(dados.cards.vencidos_val));
        atualizarCard('card-vencidos-qtd', `${dados.cards.vencidos_qtd} un.`);
        atualizarCard('card-proximos-val', formatarMoedaBRL(dados.cards.proximos_val));
        atualizarCard('card-proximos-qtd', `${dados.cards.proximos_qtd} un.`);
    }

    // Renderiza Gráficos (Chart.js)
    renderizarGraficos(dados.graficos);
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
    if (!tbody) return;

    tbody.innerHTML = LOADER_HTML;

    // Captura filtros
    const busca = document.getElementById('filtro-busca')?.value || '';
    const status = document.getElementById('filtro-status')?.value || '';
    const categoria = document.getElementById('filtro-cat')?.value || 'Todas';

    const url = `/financeiro.php?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${status}&categoria=${encodeURIComponent(categoria)}`;
    const res = await apiRequest(url);

    tbody.innerHTML = '';

    if (!res || !res.registros || res.registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" class="text-center py-4 text-muted">Nenhum registro encontrado.</td></tr>';
        return;
    }

    estadoApp.totalPaginasFinanceiro = res.total_paginas || 1;
    document.getElementById('info-paginas').innerText = `Página ${pagina} de ${estadoApp.totalPaginasFinanceiro}`;

    // Popula tabela
    res.registros.forEach(reg => {
        const tr = document.createElement('tr');

        let badgeClass = 'bg-secondary';
        if (reg.status === 'Pago') badgeClass = 'bg-success';
        else if (reg.status === 'Vencido') badgeClass = 'bg-danger';
        else if (reg.status === 'Pendente') badgeClass = 'bg-warning text-dark';

        tr.innerHTML = `
            <td>${formatarDataBR(reg.vencimento)}</td>
            <td class="font-weight-bold">${reg.descricao}</td>
            <td><span class="badge badge-light border">${reg.categoria}</span></td>
            <td class="text-right">${formatarMoedaBRL(reg.valor)}</td>
            <td><span class="badge ${badgeClass}">${reg.status}</span></td>
            <td class="text-center">
                ${reg.status !== 'Pago' ?
            `<button class="btn-icon btn-check" onclick="baixarRegistro(${reg.id})" title="Pagar">✓</button>` :
            `<span class="text-muted">✓</span>`
        }
                <button class="btn-icon btn-edit" onclick="editarRegistro(${reg.id})" title="Editar">✎</button>
                <button class="btn-icon btn-trash" onclick="excluirRegistro(${reg.id})" title="Excluir">🗑</button>
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

async function salvarBoleto() {
    const id = document.getElementById('boleto-id-hidden').value;
    const desc = document.getElementById('boleto-desc').value;
    const valorStr = document.getElementById('boleto-valor').value;
    const venc = document.getElementById('boleto-venc').value;
    const cat = document.getElementById('boleto-cat').value;
    const status = document.getElementById('boleto-status').value;
    const codBarras = document.getElementById('boleto-cod').value;

    if (!desc || !valorStr || !venc) {
        return showToast("Preencha Descrição, Valor e Vencimento.", "error");
    }

    const payload = {
        descricao: desc,
        valor: converterMoedaParaFloat(valorStr),
        vencimento: venc,
        categoria: cat,
        status: status,
        codigo_barras: codBarras // Snake_case para o PHP
    };

    let url = '/financeiro.php?action=salvar';
    if (id) {
        url = `/financeiro.php?action=atualizar&id=${id}`;
    }

    const res = await apiRequest(url, 'POST', payload);

    if (res && res.success) {
        showToast("Registro salvo com sucesso!");
        if (id) {
            navegar('lista'); // Se era edição, volta pra lista
        } else {
            prepararNovoRegistro(); // Se era novo, limpa para o próximo
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
async function lerCodigoBarras() {
    const input = document.getElementById('boleto-cod');
    const codigo = input.value;
    if (!codigo) return showToast("Digite o código para ler.", "warning");

    input.disabled = true;
    const res = await apiRequest('/boleto.php', 'POST', { codigo });
    input.disabled = false;

    if (res && res.valor) {
        document.getElementById('boleto-valor').value = formatarMoedaBRL(res.valor);
        mascaraMoedaInput(document.getElementById('boleto-valor'));
    }
    if (res && res.vencimento) {
        document.getElementById('boleto-venc').value = res.vencimento;
    }
    showToast("Código lido!", "success");
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
    document.addEventListener('keydown', (e) => {
        // Atalho Salvar (Ctrl + Enter)
        if (e.ctrlKey && e.key === 'Enter') {
            if (!document.getElementById('view-novo').classList.contains('hidden')) {
                salvarBoleto();
            }
        }
        // Atalho Login (Enter)
        if (e.key === 'Enter') {
            if (!document.getElementById('login-screen').classList.contains('hidden')) {
                login();
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

function verificarFornecedorPreenchido() {
    // Lógica de validação visual (opcional)
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