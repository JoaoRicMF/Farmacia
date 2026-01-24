/* ==========================================================================
   FARMÁCIA SYSTEM - JAVASCRIPT PRINCIPAL (V3.0 ORGANIZED)
   ========================================================================== */

/* ==========================================================================
   1. CONFIGURAÇÕES E ESTADO GLOBAL
   ========================================================================== */
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
   2. UTILITÁRIOS (HELPERS)
   ========================================================================== */

// Wrapper para Fetch (Trata Erros e JSON)
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
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

        return await response.json();
    } catch (error) {
        console.error(`Erro na requisição para ${endpoint}:`, error);
        showToast("Erro de conexão com o servidor.", "error");
        return {
            success: false,
            message: "Erro de rede"
        };
    }
}

// Formatação de Moeda e Dados
function formatarMoedaBRL(valor) {
    return parseFloat(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
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

function formatarDataBR(dataISO) {
    if (!dataISO) return '-';
    const dataPura = dataISO.split(' ')[0];
    const [ano, mes, dia] = dataPura.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Toast Notification
function showToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `
        <span class="toast-icon">${tipo === 'success' ? '✅' : '⚠️'}</span>
        <span class="toast-msg">${mensagem}</span>
    `;

    container.appendChild(toast);

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

    const res = await apiRequest('/auth.php', 'POST', {
        usuario: user,
        senha: pass
    });

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

    const userDisplay = document.getElementById('user-display');
    const userRole = document.getElementById('user-role');
    if (userDisplay) userDisplay.innerText = dadosUsuario.nome;
    if (userRole) userRole.innerText = dadosUsuario.funcao === 'Admin' ? 'Administrador' : 'Operador';

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = dadosUsuario.funcao === 'Admin' ? 'block' : 'none';
    });

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    carregarFornecedores();
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
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    const viewAlvo = document.getElementById(`view-${telaId}`);
    if (viewAlvo) {
        viewAlvo.classList.remove('hidden');

        switch (telaId) {
            case 'dashboard':
                carregarDashboard();
                break;
            case 'lista':
                carregarFinanceiro(1);
                break;
            case 'fluxo':
                carregarFluxo();
                break;
            case 'logs':
                carregarLogs();
                break;
            case 'config':
                carregarConfiguracoes();
                break;
            case 'novo':
                prepararNovoRegistro();
                break;
        }
    }

    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    const btnAtivo = document.querySelector(`.menu-item[onclick*="'${telaId}'"]`);
    if (btnAtivo) btnAtivo.classList.add('active');

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
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[onclick*="'${periodo}'"]`);
    if (btn) btn.classList.add('active');

    const dados = await apiRequest(`/dashboard.php?periodo=${periodo}`);
    if (!dados) return;

    if (dados.cards) {
        document.getElementById('card-pagar-mes').innerText = formatarMoedaBRL(dados.cards.pagar_mes);
        document.getElementById('card-pago-mes').innerText = formatarMoedaBRL(dados.cards.pago_mes);
        document.getElementById('card-vencidos-val').innerText = formatarMoedaBRL(dados.cards.vencidos_val);
        document.getElementById('card-vencidos-qtd').innerText = dados.cards.vencidos_qtd;
        document.getElementById('card-proximos-val').innerText = formatarMoedaBRL(dados.cards.proximos_val);
        document.getElementById('card-proximos-qtd').innerText = dados.cards.proximos_qtd;
    }

    renderizarGraficos(dados.graficos);
    renderizarCalendario(dados.calendario);
}

function renderizarGraficos(dadosGraficos) {
    if (!dadosGraficos) return;
    // Verifica se a biblioteca Chart.js está disponível no escopo global
    if (typeof Chart === 'undefined') {
        console.error("Erro: A biblioteca Chart.js não foi carregada corretamente.");
        return;
    }

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
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
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
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function renderizarCalendario(eventos) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    // Formata os eventos vindos da API para o padrão do FullCalendar
    const eventsParsed = eventos.map(ev => ({
        id: ev.id,
        title: `${ev.descricao} - R$ ${ev.valor}`,
        start: ev.vencimento,
        backgroundColor: ev.status === 'Pago' ? '#10b981' : (ev.status === 'Vencido' ? '#ef4444' : '#f59e0b'),
        borderColor: 'transparent',
        extendedProps: { status: ev.status }
    }));

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        events: eventos.map(ev => ({
            id: ev.id,
            title: ev.descricao,
            start: ev.vencimento,
            backgroundColor: ev.status === 'Pago' ? '#10b981' : '#ef4444'
        }))
    });
    calendar.render();
}

function toggleCalendarSection() {
    const wrap = document.getElementById('calendar-wrapper');
    const header = document.querySelector('.toggle-header');

    if (wrap.style.display === 'none' || wrap.classList.contains('hidden-content')) {
        wrap.style.display = 'block';
        wrap.classList.remove('hidden-content');
        header.classList.add('open');

        // Se estiver usando a inicialização do FullCalendar,
        // recarregue o dashboard para disparar o render()
        carregarDashboard();
    } else {
        wrap.style.display = 'none';
        header.classList.remove('open');
    }
}

/* ==========================================================================
   6. FINANCEIRO (CRUD E LISTAGEM)
   ========================================================================== */

function copiarCodigo(codigo) {
    if (!codigo) return showToast("Não há código de barras.", "error");
    navigator.clipboard.writeText(codigo).then(() => {
        showToast("Código copiado para a área de transferência!");
    }).catch(() => {
        showToast("Erro ao copiar.", "error");
    });
}

function abrirBanco() {
    window.open('https://internetbanking.caixa.gov.br/', '_blank');
}

async function carregarFinanceiro(pagina = 1) {
    estadoApp.paginaAtualFinanceiro = pagina;
    const tbody = document.querySelector('#tabela-registros tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

    const busca = document.getElementById('filtro-busca').value;
    const statusFiltro = document.getElementById('filtro-status') ? document.getElementById('filtro-status').value : 'Todos';
    const cat = document.getElementById('filtro-cat') ? document.getElementById('filtro-cat').value : 'Todas';
    const dIni = document.getElementById('filtro-data-inicio') ? document.getElementById('filtro-data-inicio').value : '';
    const dFim = document.getElementById('filtro-data-fim') ? document.getElementById('filtro-data-fim').value : '';

    let url = `/financeiro.php?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${statusFiltro}&categoria=${encodeURIComponent(cat)}`;
    if (dIni) url += `&data_inicio=${dIni}`;
    if (dFim) url += `&data_fim=${dFim}`;

    const res = await apiRequest(url);

    tbody.innerHTML = '';
    if (!res || !res.registros || res.registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
        return;
    }

    document.getElementById('info-paginas').innerText = `Página ${pagina} de ${res.total_paginas}`;
    estadoApp.totalPaginasFinanceiro = res.total_paginas;

    const hojeStr = new Date().toLocaleDateString('en-CA');

    res.registros.forEach(r => {
        let statusClass = 'status-Pendente';
        let statusTexto = r.status;

        if (r.status === 'Pago') {
            statusClass = 'status-Pago';
        } else if (r.status !== 'Pago') {
            if (r.vencimento < hojeStr) {
                statusClass = 'status-Vencido';
                statusTexto = 'Vencido';
            } else {
                statusClass = 'status-Pendente';
            }
        }

        const temCodigo = r.codigo_barras && r.codigo_barras.length > 5;
        const btnCopy = temCodigo ?
            `<button class="btn-icon btn-copy" onclick="copiarCodigo('${r.codigo_barras}')" title="Copiar Código">📋</button>` :
            '';

        const btnBank = `<button class="btn-icon btn-link" onclick="abrirBanco()" title="Acessar Caixa">🏦</button>`;

        const tr = document.createElement('tr');
        if (statusTexto === 'Vencido') tr.classList.add('row-vencido');

        tr.innerHTML = `
            <td>${formatarDataBR(r.vencimento)}</td>
            <td>
                ${r.descricao}
                ${temCodigo ? '<br><small style="color:#aaa; font-size:0.75rem;">'+r.codigo_barras+'</small>' : ''}
            </td>
            <td><span class="category-badge">${r.categoria}</span></td>
            <td style="font-weight: 500;">${formatarMoedaBRL(r.valor)}</td>
            <td><span class="status-badge ${statusClass}">${statusTexto}</span></td>
            <td class="text-right">
                ${btnCopy}
                ${btnBank}
                ${r.status !== 'Pago' ? `<button class="btn-icon btn-check" onclick="baixarRegistro(${r.id})" title="Pagar">✓</button>` : ''}
                <button class="btn-icon btn-edit" onclick="editarRegistro(${r.id})" title="Editar">✎</button>
                <button class="btn-icon btn-trash" onclick="excluirRegistro(${r.id})" title="Excluir">🗑</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function prepararNovoRegistro() {
    document.getElementById('form-boleto').reset();
    document.getElementById('boleto-id-hidden').value = '';
    document.getElementById('form-titulo').innerText = 'Novo Registro';
    setTimeout(() => document.getElementById('boleto-cod').focus(), 100);
}

async function salvarBoleto(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('boletoId').value;
    // Note que a URL é fixa, sem "?action="
    const url = '../api/financeiro.php';

    const dados = {
        descricao: document.getElementById('descricao').value,
        valor: document.getElementById('valor').value,
        vencimento: document.getElementById('vencimento').value,
        categoria_id: document.getElementById('categoria').value,
        fornecedor_id: document.getElementById('fornecedor').value,
        status: document.getElementById('status').value
    };

    // Se o ID existir, ele é adicionado ao objeto para o PHP fazer o UPDATE
    if (id) {
        dados.id = id;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        const resultado = await response.json();

        if (resultado.success) {
            alert(id ? 'Boleto atualizado com sucesso!' : 'Boleto salvo com sucesso!');
            fecharModal();
            carregarBoletos(); // Atualiza a lista na tela
        } else {
            alert('Erro: ' + resultado.error);
        }
    } catch (error) {
        console.error('Erro na requisição:', error);
        alert('Erro ao conectar com o servidor.');
    }
}

async function editarRegistro(id) {
    const res = await apiRequest(`/financeiro.php?id=${id}`);
    if (res && res.id) {
        document.getElementById('edit-id').value = res.id;
        const codInput = document.getElementById('edit-cod');
        if (codInput) codInput.value = res.codigo_barras || '';

        document.getElementById('edit-desc').value = res.descricao;
        document.getElementById('edit-venc').value = res.vencimento;
        document.getElementById('edit-cat').value = res.categoria;
        document.getElementById('edit-status').value = res.status;
        document.getElementById('edit-valor').value = formatarMoedaBRL(res.valor);

        document.getElementById('modal-editar').classList.remove('hidden');
    }
}

async function salvarEdicao() {
    const id = document.getElementById('edit-id').value;
    const desc = document.getElementById('edit-desc').value;
    const valorStr = document.getElementById('edit-valor').value;
    const venc = document.getElementById('edit-venc').value;
    const cat = document.getElementById('edit-cat').value;
    const status = document.getElementById('edit-status').value;
    const codInput = document.getElementById('edit-cod');
    const codigoBarras = codInput ? codInput.value : '';

    const valorFloat = converterMoedaParaFloat(valorStr);

    if (!desc || valorFloat <= 0 || !venc) {
        return showToast("Preencha Descrição, Valor e Vencimento.", "error");
    }

    const payload = {
        id: id,
        descricao: desc,
        valor: valorFloat,
        vencimento: venc,
        categoria: cat,
        status: status,
        codigo_barras: codigoBarras
    };

    const res = await apiRequest('/financeiro.php', 'POST', payload);

    if (res && res.success) {
        showToast("Registro atualizado com sucesso!");
        fecharModalEdicao();
        carregarFinanceiro(estadoApp.paginaAtualFinanceiro);
    } else {
        showToast(res.message || "Erro ao atualizar.", "error");
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

function mudarPagina(delta) {
    const novaPagina = estadoApp.paginaAtualFinanceiro + delta;
    if (novaPagina > 0 && novaPagina <= estadoApp.totalPaginasFinanceiro) {
        carregarFinanceiro(novaPagina);
    }
}

/* ==========================================================================
   7. AUTOMAÇÃO (LEITOR DE CÓDIGO E AUTO-COMPLETE)
   ========================================================================== */

function lerCodigoBarras(codigo) {
    // Remove qualquer caractere que não seja número
    const numerico = codigo.replace(/[^0-9]/g, '');
    const tam = numerico.length;

    let resultado = {
        valor: 0.0,
        vencimento: null,
        tipo: "Desconhecido",
        valido: false
    };

    // 1. BOLETOS DE CONCESSIONÁRIA / TRIBUTOS (48 DÍGITOS)
    // Ex: Água, Luz, Telefone, IPTU, DARF
    if (numerico.startsWith('8') && (tam === 48 || tam === 44)) {
        resultado.tipo = "Concessionária/Tributo";

        let linhaLimpa = numerico;
        if (tam === 48) {
            // Remove os dígitos verificadores das posições 12, 24, 36 e 48
            linhaLimpa = numerico.substring(0, 11) +
                numerico.substring(12, 23) +
                numerico.substring(24, 35) +
                numerico.substring(36, 47);
        }

        // O valor começa na posição 4 e tem 11 dígitos
        const valorStr = linhaLimpa.substring(4, 15);
        resultado.valor = parseFloat(valorStr) / 100;
        resultado.valido = true;
    }

    // 2. BOLETOS BANCÁRIOS (47 DÍGITOS OU 44 DO CÓDIGO DE BARRAS)
    else if (tam === 47 || tam === 44) {
        resultado.tipo = "Bancário";

        let fator = "";
        let valorStr = "";

        if (tam === 47) {
            // Linha Digitável: Fator (33-37), Valor (37-47)
            fator = numerico.substring(33, 37);
            valorStr = numerico.substring(37);
        } else {
            // Código de Barras: Fator (5-9), Valor (9-19)
            fator = numerico.substring(5, 9);
            valorStr = numerico.substring(9, 19);
        }

        resultado.valor = parseFloat(valorStr) / 100;

        // Cálculo da Data com regra de 2026
        if (fator && fator !== "0000") {
            const dataBase = new Date(1997, 9, 7); // 07/10/1997
            let dataVencimento = new Date(dataBase);
            dataVencimento.setDate(dataBase.getDate() + parseInt(fator));

            // Regra de Ouro: O fator resetou em 22/02/2022 (virou 1000 novamente)
            // Para boletos de 2025/2026, se a data calculada for antiga, somamos 9000 dias.
            const dataCorte = new Date(2022, 1, 22); // Fevereiro é mês 1 no JS
            if (dataVencimento < dataCorte) {
                dataVencimento.setDate(dataVencimento.getDate() + 9000);
            }

            resultado.vencimento = dataVencimento.toISOString().split('T')[0];
        }
        resultado.valido = true;
    }

    // 3. DETECÇÃO DE PIX (BR Code)
    if (codigo.startsWith('000201')) {
        resultado.tipo = "PIX Copia e Cola";
        resultado.valido = true;
    }

    return resultado;
}

function verificarFornecedorPreenchido() {
    const desc = document.getElementById('boleto-desc').value.toLowerCase();
    const catSelect = document.getElementById('boleto-cat');

    const mapa = {
        'cemig': 'Água/Luz/Internet',
        'energia': 'Água/Luz/Internet',
        'luz': 'Água/Luz/Internet',
        'agua': 'Água/Luz/Internet',
        'saneago': 'Água/Luz/Internet',
        'embasa': 'Água/Luz/Internet',
        'internet': 'Água/Luz/Internet',
        'vivo': 'Água/Luz/Internet',
        'claro': 'Água/Luz/Internet',
        'oi': 'Água/Luz/Internet',
        'aluguel': 'Aluguel & Condomínio',
        'condominio': 'Aluguel & Condomínio',
        'imobiliaria': 'Aluguel & Condomínio',
        'salario': 'Folha de Pagamento',
        'pagamento': 'Folha de Pagamento',
        'adiantamento': 'Folha de Pagamento',
        'drogasil': 'Medicamentos (Estoque)',
        'farma': 'Medicamentos (Estoque)',
        'eurofarma': 'Medicamentos (Estoque)',
        'cimed': 'Medicamentos (Estoque)',
        'papelaria': 'Materiais de Consumo',
        'limpeza': 'Materiais de Consumo',
        'embalagens': 'Materiais de Consumo',
        'simples': 'Impostos & Taxas',
        'das': 'Impostos & Taxas',
        'inss': 'Impostos & Taxas',
        'fgts': 'Impostos & Taxas',
        'prefeitura': 'Impostos & Taxas'
    };

    for (const chave in mapa) {
        if (desc.includes(chave)) {
            catSelect.value = mapa[chave];
            break;
        }
    }
}

function verificarVencimento() {
    const data = document.getElementById('boleto-venc').value;
    const aviso = document.getElementById('aviso-vencido');
    if (aviso && data) {
        const hoje = new Date().toISOString().split('T')[0];
        aviso.style.display = data < hoje ? 'block' : 'none';
    }
}

/* ==========================================================================
   8. FLUXO DE CAIXA
   ========================================================================== */

async function carregarFluxo() {
    const mesInput = document.getElementById('filtro-mes-fluxo');

    // 1. Garante que haja um mês selecionado (padrão mês atual)
    if (!mesInput.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        mesInput.value = `${yyyy}-${mm}`;
    }

    const tbody = document.querySelector('#tabela-fluxo tbody');
    tbody.innerHTML = LOADER_HTML;

    // 2. Chamada à API
    const res = await apiRequest(`/fluxo.php?mes=${mesInput.value}`);
    tbody.innerHTML = '';

    // 3. Verificação de segurança: res precisa existir e ter movimentacoes
    if (res) {
        const atualizarTexto = (id, valor) => {
            const el = document.getElementById(id);
            if (el) el.innerText = valor || 'R$ 0,00';
        };

        atualizarTexto('fluxo-entradas', res.total_entradas_fmt);
        atualizarTexto('fluxo-saidas', res.total_saidas_fmt);
        atualizarTexto('fluxo-saldo', res.saldo_fmt);

        atualizarTexto('total-entradas', res.total_entradas_fmt);
        atualizarTexto('total-saidas', res.total_saidas_fmt);
        atualizarTexto('total-saldo', res.saldo_fmt);

        // 4. CORREÇÃO DA LÓGICA: O loop deve estar FORA do else
        if (res.movimentacoes && res.movimentacoes.length > 0) {
            res.movimentacoes.forEach(mov => {
                const tr = document.createElement('tr');
                const isEntrada = mov.tipo === 'ENTRADA';
                const corClass = isEntrada ? 'text-success' : 'text-danger';
                const sinal = isEntrada ? '+' : '-';

                tr.innerHTML = `
                    <td>${formatarDataBR(mov.data)}</td>
                    <td>${mov.descricao}</td>
                    <td>${mov.categoria_nome || mov.categoria || '-'}</td>
                    <td class="text-right font-weight-bold ${corClass}">
                        ${sinal} ${formatarMoedaBRL(mov.valor)}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma movimentação neste período.</td></tr>';
        }
    } else {
        // Caso a API falhe ou retorne nulo
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
    }
}

async function handleSalvarMovimentoRapido(tipo) {
    const prefixo = tipo === 'entrada' ? 'ent' : 'sai';

    // Captura dos elementos
    const elDesc = document.getElementById(`${prefixo}-desc`);
    const elValor = document.getElementById(`${prefixo}-valor`);
    const elData = document.getElementById(`${prefixo}-data`);

    if (!elDesc.value || !elValor.value || !elData.value) {
        return showToast("Preencha todos os campos.", "error");
    }

    const payload = {
        descricao: elDesc.value,
        valor: converterMoedaParaFloat(elValor.value),
        data: elData.value,
        tipo: tipo.toUpperCase()
    };

    const res = await apiRequest('/fluxo.php?action=salvar', 'POST', payload);

    if (res && res.success) {
        showToast(`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} registrada com sucesso!`);

        // Limpa os campos
        elDesc.value = '';
        elValor.value = '';

        carregarFluxo(); // Atualiza a tabela e os totais
    } else {
        showToast(res.message || "Erro ao salvar movimentação.", "error");
    }
}

/* ==========================================================================
   9. FORNECEDORES & CONFIGURAÇÕES
   ========================================================================== */

/* ==========================================================================
   GERENCIAMENTO DINÂMICO DE CATEGORIAS
   ========================================================================== */

// Função principal para carregar categorias
async function carregarCategoriasSistema() {
    const categorias = await apiRequest('/categorias.php');
    if (!categorias || !Array.isArray(categorias)) return;

    // 1. Atualiza todos os Dropdowns (Selects)
    const selects = ['filtro-cat', 'boleto-cat', 'edit-cat', 'novo-forn-cat'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const valorAtual = el.value; // Mantém seleção se houver
        const temTodas = el.querySelector('option[value="Todas"]');
        el.innerHTML = temTodas ? '<option value="Todas">Todas as Categorias</option>' : '';

        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nome;
            opt.textContent = cat.nome;
            el.appendChild(opt);
        });
        el.value = valorAtual;
    });

    // 2. Renderiza a lista na aba de Configurações para maior dinamicidade
    renderizarListaCategoriasConfig(categorias);
}

// Função com confirmação para Restaurar Padrões
async function resetarCategorias() {
    // Pop-up de confirmação
    const confirmacao = confirm("⚠️ ATENÇÃO: Isso removerá todas as suas categorias personalizadas e voltará para as definições originais da farmácia. Deseja continuar?");

    if (!confirmacao) return;

    const res = await apiRequest('/categorias.php?action=reset', 'POST');
    if (res && res.success) {
        showToast("Padrões restaurados com sucesso!");
        carregarCategoriasSistema();
    }
}

function renderizarListaCategoriasConfig(categorias) {
    const container = document.getElementById('lista-categorias-config');
    if (!container) return;

    if (!categorias || categorias.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Nenhuma categoria cadastrada.</p>';
        return;
    }

    let html = '<div class="list-group mt-3">';
    categorias.forEach(cat => {
        html += `
            <div class="list-item-flex" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                <span><strong>${cat.nome}</strong></span>
                <button class="btn-icon btn-trash" onclick="excluirCategoria(${cat.id})" title="Excluir">🗑</button>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Aproveite para adicionar a função de excluir que a lista utiliza
async function excluirCategoria(id) {
    if (!confirm("Tem certeza que deseja remover esta categoria?")) return;

    const res = await apiRequest(`/categorias.php?id=${id}`, 'DELETE');
    if (res && res.success) {
        showToast("Categoria removida.");
        carregarCategoriasSistema();
    }
}

// Função para salvar nova categoria personalizada
async function handleAdicionarCategoria() {
    const nome = prompt("Digite o nome da nova categoria:");
    if (!nome) return;

    const res = await apiRequest('/categorias.php', 'POST', { nome: nome });
    if (res && res.success) {
        showToast("Categoria adicionada!");
        carregarCategoriasSistema();
    } else {
        showToast("Erro ao adicionar ou categoria já existe.", "error");
    }
}

async function carregarFornecedores() {
    const res = await apiRequest('/fornecedores.php');

    // VERIFICAÇÃO DE SEGURANÇA: Só prossegue se for uma lista (Array)
    if (res && Array.isArray(res)) {
        estadoApp.fornecedoresCache = res;

        const dl = document.getElementById('lista-fornecedores');
        if (dl) {
            dl.innerHTML = '';
            res.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.nome;
                dl.appendChild(opt);
            });
        }
    } else {
        console.warn("API de fornecedores não retornou uma lista válida:", res);
        estadoApp.fornecedoresCache = []; // Evita erro no forEach depois
    }
}

async function carregarConfiguracoes() {
    // Carrega tabela de fornecedores
    const tbody = document.getElementById('tbody-fornecedores');

    if (tbody) {
        tbody.innerHTML = '';

        // Se o cache estiver vazio, tenta carregar de novo
        if (!estadoApp.fornecedoresCache || estadoApp.fornecedoresCache.length === 0) {
            await carregarFornecedores();
        }

        // Se após tentar carregar, continuar vazio ou não for array, avisa
        if (Array.isArray(estadoApp.fornecedoresCache) && estadoApp.fornecedoresCache.length > 0) {
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
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum fornecedor cadastrado.</td></tr>';
        }
    } else {
        console.error("ERRO HTML: Não encontrei o elemento <tbody id='tbody-fornecedores'>.");
    }

    // Carrega Usuários (Apenas se for Admin e a tabela existir)
    if (estadoApp.usuario?.funcao === 'Admin') {
        const tbodyUsers = document.querySelector('#tabela-usuarios tbody');
        // Só chama a API se o elemento HTML existir
        if (tbodyUsers) {
            const resUsers = await apiRequest('/admin.php?resource=usuarios');
            tbodyUsers.innerHTML = '';

            if (resUsers && Array.isArray(resUsers)) {
                resUsers.forEach(u => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${u.nome}</td><td>${u.login}</td><td>${u.funcao}</td>`;
                    tbodyUsers.appendChild(tr);
                });
            }
        }
    }


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
    const categoriaPadrao = document.getElementById('novo-forn-cat').value;
    const dados = {
        nome: nome,
        cnpj: cnpj,
        telefone: tel,
        categoriaPadrao: categoriaPadrao // O PHP espera 'categoriaPadrao' (CamelCase)
    };

    try {
        const response = await fetch('../api/fornecedores.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        const resultado = await response.json();

        if (resultado.success) {
            alert('Fornecedor cadastrado com sucesso!');
            // Aqui você pode adicionar funções para fechar o modal ou limpar os campos
            // fecharModalFornecedor();
        } else {
            alert('Erro ao salvar: ' + resultado.error);
        }
    } catch (error) {
        console.error('Erro na requisição:', error);
        alert('Erro de conexão com o servidor.');
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
   10. LOGS DO SISTEMA
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
   11. CONTROLES DE UI E MODAIS
   ========================================================================== */

function confirmarLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalLogout() {
    const modal = document.getElementById('modal-logout');
    if (modal) modal.classList.add('hidden');
}

function fecharModalEdicao() {
    document.getElementById('modal-editar').classList.add('hidden');
}

function fecharModal() {
    document.getElementById('modal-detalhes').classList.add('hidden');
}

function toggleSenha() {
    const input = document.getElementById('login-pass');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function verDetalhes(tipo) {
    navegar('lista');
    setTimeout(() => {
        if (tipo === 'vencidos') preFiltrarLista('Vencido');
        if (tipo === 'proximos') preFiltrarLista('Pendente', 7);
    }, 100);
}

function preFiltrarLista(status, diasFuturos = null) {
    const selStatus = document.getElementById('filtro-status');
    const inpInicio = document.getElementById('filtro-data-inicio');
    const inpFim = document.getElementById('filtro-data-fim');

    if (inpInicio) inpInicio.value = '';
    if (inpFim) inpFim.value = '';

    if (selStatus) {
        if (status === 'Vencido') {
            selStatus.value = 'Todos';
            let ontem = new Date();
            ontem.setDate(ontem.getDate() - 1);
            inpFim.value = ontem.toISOString().split('T')[0];
        } else {
            selStatus.value = status;
        }
    }

    if (diasFuturos) {
        const hoje = new Date();
        inpInicio.value = hoje.toISOString().split('T')[0];
        let futuro = new Date();
        futuro.setDate(futuro.getDate() + diasFuturos);
        inpFim.value = futuro.toISOString().split('T')[0];
    }

    carregarFinanceiro(1);
}

function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

/* ==========================================================================
   12. WRAPPERS HTML (Conectores onclick)
   ========================================================================== */
// Estas funções conectam os atributos onclick do HTML à lógica do JS

function nav(tela) {
    navegar(tela);
}
function filtrarDashboard(periodo) {
    carregarDashboard(periodo);
}
function carregarLista(pagina) {
    carregarFinanceiro(pagina);
}
function debounceCarregarLista() {
    carregarFinanceiro(1);
}
function mascaraMoeda(input) {
    mascaraMoedaInput(input);
}
function limparFormulario() {
    prepararNovoRegistro();
}
function cadastrarFornecedor() {
    salvarNovoFornecedor();
}
function fazerLogoutReal() {
    logout();
}
function fazerLogin() {
    login(event);
}
function salvarEntradaCaixa() {
    salvarMovimentoRapido('entrada');
}
function salvarSaidaCaixa() {
    salvarMovimentoRapido('saida');
}
function salvarConfiguracoes() {
    showToast("Perfil salvo com sucesso!");
}
function baixarExcelFluxo() {
    // Redireciona para o script PHP que gera o ficheiro
    window.location.href = CONFIG.API_URL + '/exportar.php';
    showToast("A preparar o download da planilha...");
}
async function adicionarCategoriaPersonalizada() {
    const nome = prompt("Digite o nome da nova categoria:");
    if (!nome || nome.trim() === "") return;

    // Faz a chamada para a API de categorias
    const res = await apiRequest('/categorias.php', 'POST', {
        nome: nome.trim(),
        cor: '#3b82f6' // Cor padrão azul
    });

    if (res && res.success) {
        showToast("Categoria adicionada com sucesso!");
        // Recarrega as categorias nos selects e na lista da aba config
        await carregarCategoriasSistema();
    } else {
        showToast(res.message || "Erro ao adicionar categoria ou ela já existe.", "error");
    }
}
async function criarNovoUsuario() {
    const dados = {
        nome: document.getElementById('user-nome').value,
        login: document.getElementById('user-login').value,
        password: document.getElementById('user-pass').value,
        nivel: document.getElementById('user-nivel').value
    };

    const response = await fetch('../api/admin.php?action=criarUsuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });

    const res = await response.json();
    if(res.success) alert("Utilizador criado!");
}

/* ==========================================================================
   13. INICIALIZAÇÃO
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Verifica login
    verificarSessao();
    carregarCategoriasSistema();

    // 2. Prepara datas nos inputs de "hoje"
    const hoje = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(inp => {
        if (!inp.value && !inp.id.startsWith('filtro-')) {
            inp.value = hoje;
        }
    });

    // 3. Adiciona listeners para máscaras de moeda
    document.querySelectorAll('.input-money').forEach(inp => {
        inp.addEventListener('input', () => mascaraMoedaInput(inp));
    });

    // 4. Impede reload de form
    const form = document.getElementById("form-boleto");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
        });
    }

    // 5. Configuração do Tema
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.body.setAttribute('data-theme', savedTheme);

    // 6. Listeners de Teclado
    document.addEventListener('keydown', function(event) {
        const telaNovo = document.getElementById('view-novo');
        const telaLogin = document.getElementById('login-screen');

        // Se estiver na tela de LOGIN
        if (telaNovo && !telaNovo.classList.contains('hidden') && telaNovo.offsetParent !== null) {
            if (event.key === 'Enter') {
                // Se o elemento focado for um botão, deixa ele clicar normalmente
                if (event.target.tagName === 'BUTTON') return;

                event.preventDefault();

                // Lista de IDs dos campos na ordem que você quer que o foco pule
                const ordemCampos = [
                    'boleto-cod',
                    'boleto-desc',
                    'boleto-valor',
                    'boleto-venc',
                    'boleto-cat',
                    'boleto-status'
                ];

                const indexAtual = ordemCampos.indexOf(event.target.id);

                if (indexAtual > -1 && indexAtual < ordemCampos.length - 1) {
                    // Pula para o próximo campo da lista
                    document.getElementById(ordemCampos[indexAtual + 1]).focus();
                } else if (indexAtual === ordemCampos.length - 1) {
                    // Se estiver no último campo, salva o boleto
                    salvarBoleto(event.ctrlKey);
                }
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                const desc = document.getElementById('boleto-desc').value;
                if (desc.trim() !== '') {
                    prepararNovoRegistro();
                } else {
                    navegar('lista');
                }
            }
        }
    });
});