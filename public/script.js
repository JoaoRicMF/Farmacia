/* ==========================================================================
   FARMÁCIA SYSTEM - JAVASCRIPT PRINCIPAL (CORRIGIDO)
   ========================================================================== */

/* ==========================================================================
   1. CONFIGURAÇÕES E ESTADO GLOBAL
   ========================================================================== */
const CONFIG = {
    // CORREÇÃO 1: Caminho absoluto para a API (evita o erro /api/categorias/auth.php)
    API_URL: '/api',
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

let buscaTimeout;

// Elementos de UI reutilizáveis
const LOADER_HTML = `
    <tr><td colspan="100%" class="text-center py-4">
        <div class="loader-spinner"></div> Carregando...
    </td></tr>`;

/* ==========================================================================
   2. UTILITÁRIOS (HELPERS)
   ========================================================================== */

async function apiRequest(url, method = 'GET', body = null) {
    // Remove barra inicial do endpoint se houver, para evitar duplicidade com CONFIG.API_URL
    const endpoint = url.startsWith('/') ? url.substring(1) : url;

    // Remove '/api/' do endpoint se o programador tiver colocado manualmente
    const cleanEndpoint = endpoint.startsWith('api/') ? endpoint.substring(4) : endpoint;

    const fullUrl = `${CONFIG.API_URL}/${cleanEndpoint}`;

    const options = {
        method: method,
        headers: { 'Accept': 'application/json' }
    };

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(fullUrl, options);
        const contentType = response.headers.get('content-type');

        if (!contentType || !contentType.includes('application/json')) {
            console.error("O servidor não retornou JSON. Status:", response.status);
            return null;
        }

        if (response.status === 401) {
            showToast("Sessão expirada. Redirecionando...", "error");
            setTimeout(() => window.location.reload(), 2000);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error("Erro na comunicação com a API:", error.message);
        return null;
    }
}

// Unificação das funções de checagem de sessão
async function verificarSessao() {
    // CORREÇÃO 2: Variável 'res' substituída por 'data'
    const data = await apiRequest('auth.php?action=check');

    if (data && data.id) {
        iniciarApp(data);
        return true;
    } else {
        exibirTelaLogin();
        return false;
    }
}

function alternarTelas(tela) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.add('hidden');

    if (tela === 'login') {
        document.getElementById('login-screen').classList.remove('hidden');
    } else {
        document.getElementById('app-screen').classList.remove('hidden');
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
    return parseFloat(valorString.replace(/[^\d,]/g, '').replace(',', '.'));
}

function formatarDataBR(dataISO) {
    if (!dataISO) return '-';
    const dataPura = dataISO.split(' ')[0];
    const [ano, mes, dia] = dataPura.split('-');
    return `${dia}/${mes}/${ano}`;
}

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

async function login(event) {
    if (event) event.preventDefault();

    const userVal = document.getElementById('login-user').value;
    const passVal = document.getElementById('login-pass').value;
    const btn = document.getElementById('btn-entrar');

    // Guarda o texto original para restaurar depois
    const textoOriginal = btn.innerText;

    if (!userVal || !passVal) return showToast("Preencha usuário e senha.", "error");

    try {
        // 1. Bloqueia UI
        btn.disabled = true;
        btn.innerText = "Entrando...";

        // 2. Requisição
        // Nota: apiRequest já trata JSON, mas se o servidor der erro 500 HTML fatal,
        // ele pode retornar null ou lançar erro dependendo da sua implementação interna.
        // Aqui assumimos que ele retorna o objeto ou null.
        const res = await apiRequest('auth.php', 'POST', {
            usuario: userVal,
            senha: passVal
        });

        // 3. Validação da Resposta
        if (!res) {
            showToast("Falha na comunicação com o servidor. Verifique o banco de dados.", "error");
            return; // Encerra a função sem precisar do throw
        }

        if (res.success) {
            showToast(`Bem-vindo, ${res.nome}!`);
            iniciarApp(res); // Função que troca as telas
        } else {
            showToast(res.message || "Credenciais inválidas.", "error");
        }

    } catch (error) {
        console.error("Erro crítico no login:", error);
        showToast("Erro no Login: " + error.message, "error");
    } finally {
        // 4. Restaura UI (Sempre executa, sucesso ou erro)
        btn.disabled = false;
        btn.innerText = textoOriginal;
    }
}
async function confirmarResetSenha() {
    const idUser = document.getElementById('reset-id-user').value;
    const novaSenha = document.getElementById('reset-nova-senha').value;

    if (!idUser || !novaSenha) {
        return showToast("A nova senha é obrigatória.", "error");
    }

    const btn = document.querySelector('#modal-reset-senha .btn-primary');
    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const res = await apiRequest('admin.php?action=resetSenha', 'POST', {
        id: idUser,
        novaSenha: novaSenha
    });

    btn.innerText = textoOriginal;
    btn.disabled = false;

    if (res && res.success) {
        showToast("Senha alterada com sucesso!");
        document.getElementById('reset-nova-senha').value = ''; // Limpa o campo
        document.getElementById('modal-reset-senha').classList.add('hidden'); // Fecha modal
    } else {
        showToast(res.message || "Erro ao resetar senha.", "error");
    }
}

// Função auxiliar para fechar o modal (já referenciada no HTML)
function fecharModalReset() {
    document.getElementById('modal-reset-senha').classList.add('hidden');
}

function logoutFrontend() {
    estadoApp.usuario = null;
    sessionStorage.clear();
    exibirTelaLogin();
}

async function logout() {
    await apiRequest('auth.php?action=logout');
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

    carregarFornecedores(); // Carrega lista de fornecedores em background
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
    overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
}

/* ==========================================================================
   5. DASHBOARD
   ========================================================================== */

async function carregarDashboard(periodo = '7d') {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[onclick*="'${periodo}'"]`);
    if (btn) btn.classList.add('active');

    const dados = await apiRequest(`dashboard.php?periodo=${periodo}`);
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
    if (!dadosGraficos || typeof Chart === 'undefined') return;

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

function renderizarCalendario(eventos) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        events: eventos.map(ev => ({
            id: ev.id,
            title: ev.descricao,
            start: ev.vencimento,
            backgroundColor: ev.status === 'Pago' ? '#10b981' : (ev.status === 'Vencido' ? '#ef4444' : '#f59e0b')
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
        carregarDashboard();
    } else {
        wrap.style.display = 'none';
        header.classList.remove('open');
    }
}

/* ==========================================================================
   6. FINANCEIRO
   ========================================================================== */

function copiarCodigo(codigo) {
    if (!codigo) return showToast("Não há código de barras.", "error");
    navigator.clipboard.writeText(codigo).then(() => showToast("Copiado!")).catch(() => showToast("Erro.", "error"));
}

function abrirBanco() {
    window.open('https://internetbanking.caixa.gov.br/', '_blank');
}

async function carregarFinanceiro(pagina = 1) {
    estadoApp.paginaAtualFinanceiro = pagina;
    const tbody = document.querySelector('#tabela-registros tbody');
    tbody.innerHTML = LOADER_HTML;

    const busca = document.getElementById('filtro-busca').value;
    const status = document.getElementById('filtro-status')?.value || 'Todos';
    const cat = document.getElementById('filtro-cat')?.value || 'Todas';
    const dIni = document.getElementById('filtro-data-inicio')?.value || '';
    const dFim = document.getElementById('filtro-data-fim')?.value || '';

    let url = `financeiro.php?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${status}&categoria=${encodeURIComponent(cat)}`;
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
            }
        }

        const temCodigo = r.codigo_barras && r.codigo_barras.length > 5;
        const btnCopy = temCodigo ? `<button class="btn-icon btn-copy" onclick="copiarCodigo('${r.codigo_barras}')" title="Copiar">📋</button>` : '';

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
                <button class="btn-icon btn-link" onclick="abrirBanco()" title="Banco">🏦</button>
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

// Função unificada para salvar boletos
async function salvarBoleto(event) {
    if (event) event.preventDefault();

    // Mapeamento correto dos IDs do index.html
    const descInput = document.getElementById('boleto-desc');
    const valorInput = document.getElementById('boleto-valor');
    const vencInput = document.getElementById('boleto-venc');
    const codInput = document.getElementById('boleto-cod');
    const catSelect = document.getElementById('boleto-cat');
    const statusSelect = document.getElementById('boleto-status');

    // Validação básica
    if (!descInput.value || !valorInput.value || !vencInput.value) {
        return showToast("Preencha a descrição, valor e vencimento.", "error");
    }

    // Preparação do Payload
    const payload = {
        descricao: descInput.value,
        valor: converterMoedaParaFloat(valorInput.value), // Converte "R$ 1.000,00" para 1000.00
        vencimento: vencInput.value,
        categoria: catSelect.value || "Outros",
        status: statusSelect.value,
        codigo_barras: codInput.value
    };

    // Envio para a API
    const res = await apiRequest('financeiro.php?action=salvar', 'POST', payload);

    if (res && res.success) {
        showToast('Boleto salvo com sucesso!');
        // Limpa formulário se não for "Salvar + Novo" (lógica controlada pelo botão no HTML)
        if (!event || event.type === 'submit') {
            document.getElementById('form-boleto').reset();
            prepararNovoRegistro();
        }
        carregarDashboard(); // Atualiza os cards
    } else {
        showToast('Erro ao salvar: ' + (res.message || 'Erro desconhecido'), 'error');
    }
}

async function editarRegistro(id) {
    const res = await apiRequest(`financeiro.php?id=${id}`);
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
    const codigoBarras = document.getElementById('edit-cod')?.value || '';

    const valorFloat = converterMoedaParaFloat(valorStr);

    if (!desc || valorFloat <= 0 || !venc) return showToast("Preencha Descrição, Valor e Vencimento.", "error");

    const payload = {
        id: id,
        descricao: desc,
        valor: valorFloat,
        vencimento: venc,
        categoria: cat,
        status: status,
        codigo_barras: codigoBarras
    };

    const res = await apiRequest('financeiro.php', 'POST', payload);

    if (res && res.success) {
        showToast("Registro atualizado com sucesso!");
        fecharModalEdicao();
        carregarFinanceiro(estadoApp.paginaAtualFinanceiro);
    } else {
        showToast(res.message || "Erro ao atualizar.", "error");
    }
}

async function excluirRegistro(id) {
    if (!confirm("Tem certeza que deseja excluir?")) return;
    const res = await apiRequest(`financeiro.php?action=excluir&id=${id}`, 'POST');
    if (res && res.success) {
        showToast("Excluído.");
        carregarFinanceiro(estadoApp.paginaAtualFinanceiro);
    }
}

async function baixarRegistro(id) {
    if (!confirm("Confirmar baixa?")) return;
    const res = await apiRequest(`financeiro.php?action=baixar&id=${id}`, 'POST');
    if (res && res.success) {
        showToast("Baixa realizada!");
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
   7. AUTOMAÇÃO E LEITOR
   ========================================================================== */

async function lerCodigoBarras() {
    const inputCod = document.getElementById('boleto-cod');
    // Remove espaços em branco, mas mantem caracteres caso seja um Hash Pix
    const codigo = inputCod.value.trim();

    if (codigo.length < 10) return; // Validação básica para evitar requisições inúteis

    // Chama a API boleto.php para interpretar o código (Boleto ou PIX)
    const res = await apiRequest('boleto.php', 'POST', { codigo: codigo });

    if (res && res.valido) {
        showToast("Código identificado com sucesso!");

        // --- LÓGICA PIX ---
        if (res.tipo === 'PIX Copia e Cola' || res.tipo.includes('PIX')) {
            const modalQR = document.getElementById('modal-qrcode');
            const imgQR = document.getElementById('img-qrcode');

            if (modalQR && imgQR) {
                // Usa API pública para gerar o QR Code visualmente a partir da string PIX
                imgQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codigo)}`;
                modalQR.classList.remove('hidden');
                showToast("QR Code PIX Gerado.", "success");
            }
        }

        // --- PREENCHIMENTO AUTOMÁTICO DO FORMULÁRIO ---
        if (res.valor > 0) {
            const campoValor = document.getElementById('boleto-valor');
            // Formata o valor retornado pela API para o padrão do input (R$ ...)
            campoValor.value = formatarMoedaBRL(res.valor);
        }

        if (res.vencimento) {
            document.getElementById('boleto-venc').value = res.vencimento;
            verificarVencimento(); // Chama função auxiliar visual de vencimento
        }

    } else {
        // Opcional: Feedback discreto se não for válido
        console.log("Código não reconhecido pela API.");
    }
}

function fecharModalQR() {
    const modal = document.getElementById('modal-qrcode');
    if (modal) modal.classList.add('hidden');
}

// Funções de Máscara
function mascaraCNPJ(input) {
    let v = input.value.replace(/\D/g, ''); // Remove tudo que não é dígito

    if (v.length > 14) v = v.substring(0, 14); // Limita tamanho

    // Coloca ponto entre o segundo e o terceiro dígitos
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    // Coloca ponto entre o quinto e o sexto dígitos
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    // Coloca uma barra entre o oitavo e o nono dígitos
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    // Coloca um hífen depois do bloco de quatro dígitos
    v = v.replace(/(\d{4})(\d)/, "$1-$2");

    input.value = v;
}

function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, "");

    if (v.length > 11) v = v.substring(0, 11);

    // Formatação dinâmica para 10 (fixo) ou 11 (celular) dígitos
    if (v.length > 10) {
        v = v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (v.length > 5) {
        v = v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (v.length > 2) {
        v = v.replace(/^(\d\d)(\d{0,5})/, "($1) $2");
    }

    input.value = v;
}

function debounceCarregarLista() {
    // 1. Limpa o agendamento anterior se o usuário continuar digitando
    clearTimeout(buscaTimeout);

    // 2. Agenda a execução para 500ms após a última tecla
    buscaTimeout = setTimeout(() => {
        // Reseta para a página 1 ao realizar nova busca
        carregarFinanceiro(1);
    }, 500);
}

function verificarFornecedorPreenchido() {
    const descInput = document.getElementById('boleto-desc');
    const catSelect = document.getElementById('boleto-cat');

    if (!descInput || !catSelect) return;

    const termoDigitado = descInput.value.toLowerCase();

    // Verifica se o cache de fornecedores está carregado
    if (estadoApp.fornecedoresCache && Array.isArray(estadoApp.fornecedoresCache)) {

        // Procura um fornecedor cujo nome esteja contido no que foi digitado
        const fornecedorEncontrado = estadoApp.fornecedoresCache.find(f =>
            termoDigitado.includes(f.nome.toLowerCase())
        );

        if (fornecedorEncontrado && fornecedorEncontrado.categoriaPadrao) {
            catSelect.value = fornecedorEncontrado.categoriaPadrao;
            // Opcional: Feedback visual ou console.log(`Categoria ${fornecedorEncontrado.categoriaPadrao} aplicada autom.`);
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
    if (!mesInput.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        mesInput.value = `${yyyy}-${mm}`;
    }

    const tbody = document.querySelector('#tabela-fluxo tbody');
    tbody.innerHTML = LOADER_HTML;

    const res = await apiRequest(`fluxo.php?mes=${mesInput.value}`);
    tbody.innerHTML = '';

    if (res) {
        const atualizarTexto = (id, valor) => {
            const detalheEl = document.getElementById('detalhe-entradas');
            if (detalheEl) {
                detalheEl.innerText = `Din: ${res.total_dinheiro} | Pix: ${res.total_pix} | Cart: ${res.total_cartao}`;
            }
        };

        atualizarTexto('fluxo-entradas', res.total_entradas_fmt);
        atualizarTexto('fluxo-saidas', res.total_saidas_fmt);
        atualizarTexto('fluxo-saldo', res.saldo_fmt);
        atualizarTexto('total-entradas', res.total_entradas_fmt);
        atualizarTexto('total-saidas', res.total_saidas_fmt);
        atualizarTexto('total-saldo', res.saldo_fmt);

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
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma movimentação.</td></tr>';
        }
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar.</td></tr>';
    }
}

async function handleSalvarMovimentoRapido(tipo) {
    const prefixo = tipo === 'entrada' ? 'ent' : 'sai';
    const elDesc = document.getElementById(`${prefixo}-desc`);
    const elValor = document.getElementById(`${prefixo}-valor`);
    const elData = document.getElementById(`${prefixo}-data`);

    if (!elDesc.value || !elValor.value || !elData.value) return showToast("Preencha todos os campos.", "error");

    const payload = {
        descricao: elDesc.value,
        valor: converterMoedaParaFloat(elValor.value),
        data: elData.value,
        tipo: tipo.toUpperCase()
    };

    const res = await apiRequest('fluxo.php?action=salvar', 'POST', payload);

    if (res && res.success) {
        showToast("Registrado com sucesso!");
        elDesc.value = ''; elValor.value = '';
        carregarFluxo();
    } else {
        showToast(res.message || "Erro ao salvar.", "error");
    }
}

/* ==========================================================================
   9. CATEGORIAS E FORNECEDORES
   ========================================================================== */

async function carregarCategoriasSistema() {
    const categorias = await apiRequest('categorias.php');
    if (!categorias || !Array.isArray(categorias)) return;

    const selectsAlvo = ['filtro-cat', 'boleto-cat', 'edit-cat', 'novo-forn-cat'];
    selectsAlvo.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const valorSelecionado = el.value;
        const opcaoPadrao = el.firstElementChild ? el.firstElementChild.cloneNode(true) : null;
        el.innerHTML = '';
        if (opcaoPadrao) el.appendChild(opcaoPadrao);

        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nome;
            opt.textContent = cat.nome;
            el.appendChild(opt);
        });
        if (valorSelecionado) el.value = valorSelecionado;
    });

    renderizarListaCategoriasConfig(categorias);
}

function renderizarListaCategoriasConfig(categorias) {
    const container = document.getElementById('lista-categorias-config');
    if (!container) return;

    let html = '<div class="list-group mt-3">';
    categorias.forEach(cat => {
        html += `
            <div class="list-item-flex" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${cat.cor || '#3b82f6'}; display: inline-block;"></span>
                    <strong>${cat.nome}</strong>
                </div>
                <button class="btn-icon btn-trash" onclick="excluirCategoria(${cat.id})" title="Excluir">🗑</button>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function excluirCategoria(id) {
    if (!confirm("Remover categoria?")) return;
    const res = await apiRequest(`categorias.php?id=${id}`, 'DELETE');
    if (res && res.success) {
        showToast("Categoria removida.");
        carregarCategoriasSistema();
    }
}

async function adicionarCategoriaPersonalizada() {
    const nome = prompt("Nome da nova categoria:");
    if (!nome || nome.trim() === "") return;

    const res = await apiRequest('categorias.php', 'POST', { nome: nome.trim() });
    if (res && res.success) {
        showToast("Adicionada!");
        carregarCategoriasSistema();
    } else {
        showToast(res.message || "Erro ao adicionar.", "error");
    }
}

async function carregarFornecedores() {
    const res = await apiRequest('fornecedores.php');
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
    }
}

async function carregarConfiguracoes() {
    // Populando campos de perfil do usuário (Novo)
    if (estadoApp.usuario) {
        const inputLogin = document.getElementById('conf-login');
        const inputNome = document.getElementById('conf-nome');
        if (inputLogin) inputLogin.value = estadoApp.usuario.usuario || estadoApp.usuario.login || '';
        if (inputNome) inputNome.value = estadoApp.usuario.nome || '';
    }
    const tbody = document.getElementById('tbody-fornecedores');
    if (tbody) {
        tbody.innerHTML = '';
        if (!estadoApp.fornecedoresCache || estadoApp.fornecedoresCache.length === 0) await carregarFornecedores();

        if (Array.isArray(estadoApp.fornecedoresCache) && estadoApp.fornecedoresCache.length > 0) {
            estadoApp.fornecedoresCache.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${f.nome}</td><td>${f.cnpj || '-'}</td><td>${f.telefone || '-'}</td>
                                <td class="text-right"><button class="btn-icon btn-trash" onclick="excluirFornecedor(${f.id})">🗑</button></td>`;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum fornecedor.</td></tr>';
        }
    }

    if (estadoApp.usuario?.funcao === 'Admin') {
        // CORREÇÃO: Uso do ID correto definido no index.html
        const tbodyUsers = document.getElementById('tabela-usuarios-config');

        if (tbodyUsers) {
            const resUsers = await apiRequest('admin.php?resource=usuarios');
            tbodyUsers.innerHTML = '';

            if (resUsers && Array.isArray(resUsers)) {
                resUsers.forEach(u => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${u.nome}</td>
                        <td>${u.login}</td>
                        <td><span class="status-badge">${u.funcao}</span></td>
                        <td class="text-right">
                            <button class="btn-icon" onclick="abrirModalReset(${u.id}, '${u.nome}')" title="Alterar Senha">🔑</button>
                            <button class="btn-icon btn-trash" onclick="excluirUsuario(${u.id})" title="Excluir">🗑</button>
                        </td>`;
                    tbodyUsers.appendChild(tr);
                });
            }
        }
    }
}
function abrirModalReset(id, nome) {
    document.getElementById('reset-id-user').value = id;
    document.getElementById('reset-nome-user').innerText = nome;
    document.getElementById('modal-reset-senha').classList.remove('hidden');
}

async function excluirUsuario(id) {
    if (!confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;

    // Envia requisição POST com action 'excluir' para o admin.php
    const res = await apiRequest('admin.php?action=excluir', 'POST', { id: id });

    if (res && res.success) {
        showToast("Usuário excluído com sucesso!", "success");
        // Atualiza a lista de usuários na tela de configurações
        carregarConfiguracoes();
    } else {
        showToast(res?.message || "Erro ao excluir usuário.", "error");
    }
}

async function resetarCategorias() {
    if (!confirm("Isso apagará todas as categorias personalizadas e restaurará as padrões. Continuar?")) return;

    const res = await apiRequest('categorias.php?action=reset', 'POST', {});

    if (res && res.success) {
        showToast("Categorias restauradas para o padrão.");
        await carregarCategoriasSistema();
    } else {
        showToast(res?.message || "Erro ao resetar categorias.", "error");
    }
}

async function verDetalhes(tipo, titulo) {
    // 1. Configura a UI do Modal
    document.getElementById('modal-titulo').innerText = titulo;
    document.getElementById('modal-detalhes').classList.remove('hidden');

    const tbody = document.querySelector('#tabela-modal tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="loader-spinner"></div> Buscando dados...</td></tr>';

    // 2. Prepara os filtros para a API financeiro.php
    const hoje = new Date().toISOString().split('T')[0];
    let url = 'financeiro.php?pagina=1&limite=50'; // Traz até 50 registros para o detalhe

    if (tipo === 'proximos') {
        // Calcula data daqui a 7 dias
        const futuro = new Date();
        futuro.setDate(futuro.getDate() + 7);
        const dataFim = futuro.toISOString().split('T')[0];

        url += `&status=Pendente&data_inicio=${hoje}&data_fim=${dataFim}`;
    } else if (tipo === 'vencidos') {
        url += `&status=Vencido`; // O backend já filtra vencidos históricos
    }

    // 3. Requisição
    const res = await apiRequest(url);
    tbody.innerHTML = '';

    // 4. Renderização
    if (res && res.registros && res.registros.length > 0) {
        res.registros.forEach(r => {
            const tr = document.createElement('tr');

            // Define classe de cor baseada no status
            let badgeClass = 'status-Pendente';
            if(r.status === 'Pago') badgeClass = 'status-Pago';
            if(r.status === 'Vencido') badgeClass = 'status-Vencido';

            tr.innerHTML = `
                <td>${formatarDataBR(r.vencimento)}</td>
                <td>${r.descricao}</td>
                <td>${formatarMoedaBRL(r.valor)}</td>
                <td><span class="status-badge ${badgeClass}">${r.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum registro encontrado para este período.</td></tr>';
    }
}

function preFiltrarLista(status) {
    // 1. Define o valor no elemento de UI
    const selectStatus = document.getElementById('filtro-status');
    if (selectStatus) {
        selectStatus.value = status;
    }

    // 2. Navega para a tela de lista (que já limpa as outras views)
    navegar('lista');
}

async function salvarNovoFornecedor() {
    const nome = document.getElementById('novo-forn-nome').value;
    const cnpj = document.getElementById('novo-forn-cnpj').value;
    const tel = document.getElementById('novo-forn-tel').value;
    const categoriaPadrao = document.getElementById('novo-forn-cat').value;

    const res = await apiRequest('fornecedores.php', 'POST', {
        nome: nome, cnpj: cnpj, telefone: tel, categoriaPadrao: categoriaPadrao
    });

    if (res && res.success) {
        alert('Fornecedor cadastrado!');
    } else {
        alert('Erro ao salvar: ' + (res?.error || 'Erro desconhecido'));
    }
}

async function excluirFornecedor(id) {
    if (!confirm("Remover fornecedor?")) return;
    const res = await apiRequest(`fornecedores.php?id=${id}`, 'DELETE');
    if (res && res.success) {
        showToast("Fornecedor removido.");
        await carregarFornecedores();
        carregarConfiguracoes();
    }
}

/* ==========================================================================
   10. LOGS E UTILS
   ========================================================================== */

async function carregarLogs() {
    const tbody = document.querySelector('#tabela-logs tbody');
    if (!tbody) return;
    tbody.innerHTML = LOADER_HTML;
    const res = await apiRequest('admin.php?resource=logs');
    tbody.innerHTML = '';
    if (!res || res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhum log.</td></tr>';
        return;
    }
    res.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td style="font-size:0.85em; color:var(--text-light)">${log.dataHora}</td>
        <td><strong>${log.usuario}</strong></td>
        <td>${log.acao}</td>
        <td style="font-size:0.85em; color:var(--text-light)">${log.detalhes || '-'}</td>
    `;
        tbody.appendChild(tr);
    });
}
async function salvarConfiguracoes() {
    const nome = document.getElementById('conf-nome').value;
    const senha = document.getElementById('conf-senha').value;
    const login = document.getElementById('conf-login').value; // Necessário para a API validar
    const idUser = estadoApp.usuario.id;
    const funcaoUser = estadoApp.usuario.funcao; // Mantém a função atual

    if (!nome) return showToast("O nome é obrigatório.", "error");

    // 1. Atualiza dados cadastrais (Nome/Login)
    const payloadPerfil = {
        id: idUser,
        nome: nome,
        login: login, // A API admin.php exige o login
        funcao: funcaoUser
    };

    const resPerfil = await apiRequest('admin.php?action=editar', 'POST', payloadPerfil);

    if (resPerfil && resPerfil.success) {
        let msg = "Perfil atualizado!";

        // Atualiza estado local
        estadoApp.usuario.nome = nome;
        document.getElementById('user-display').innerText = nome;

        // 2. Se houver senha, faz o update da senha separadamente
        if (senha && senha.trim() !== "") {
            const resSenha = await apiRequest('admin.php?action=resetSenha', 'POST', {
                id: idUser,
                novaSenha: senha
            });

            if (resSenha && resSenha.success) {
                msg += " E senha alterada.";
                document.getElementById('conf-senha').value = ''; // Limpa campo senha
            } else {
                msg += " Mas erro ao salvar senha.";
            }
        }

        showToast(msg);
    } else {
        showToast(resPerfil?.message || "Erro ao atualizar perfil. (Requer Admin)", "error");
    }
}

function confirmarLogout() { document.getElementById('modal-logout').classList.remove('hidden'); }
function fecharModalLogout() { document.getElementById('modal-logout').classList.add('hidden'); }
function fecharModalEdicao() { document.getElementById('modal-editar').classList.add('hidden'); }
function fecharModal() { document.getElementById('modal-detalhes').classList.add('hidden'); }
function toggleSenha() { const x = document.getElementById('login-pass'); x.type = x.type === 'password' ? 'text' : 'password'; }
function toggleDarkMode() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Conectores HTML
function nav(tela) { navegar(tela); }
function filtrarDashboard(periodo) { carregarDashboard(periodo); }
function carregarLista(pagina) { carregarFinanceiro(pagina); }
function mascaraMoeda(input) { mascaraMoedaInput(input); }
function limparFormulario() { prepararNovoRegistro(); }
function cadastrarFornecedor() { salvarNovoFornecedor(); }
function fazerLogoutReal() { logout(); }
function fazerLogin() { login(event); }
function salvarEntradaCaixa() { handleSalvarMovimentoRapido('entrada'); }
function salvarSaidaCaixa() { handleSalvarMovimentoRapido('saida'); }
function baixarExcelFluxo() {
    const mesInput = document.getElementById('filtro-mes-fluxo');
    let url = CONFIG.API_URL + '/exportar.php';

    // Se houver um mês selecionado no filtro de fluxo, anexa à URL
    if (mesInput && mesInput.value) {
        url += `?mes=${mesInput.value}`;
    }

    window.location.href = url;
}

/* ==========================================================================
   11. INICIALIZAÇÃO
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    const logado = await verificarSessao();

    if (logado) {
        carregarCategoriasSistema();

        const hoje = new Date().toISOString().split('T')[0];
        document.querySelectorAll('input[type="date"]').forEach(inp => {
            if (!inp.value && !inp.id.startsWith('filtro-')) inp.value = hoje;
        });

        document.querySelectorAll('.input-money').forEach(inp => {
            inp.addEventListener('input', () => mascaraMoedaInput(inp));
        });

        const form = document.getElementById("form-boleto");
        if (form) form.addEventListener("submit", (e) => e.preventDefault());

        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) document.body.setAttribute('data-theme', savedTheme);

        const inputCNPJ = document.getElementById('novo-forn-cnpj');
        if (inputCNPJ) {
            inputCNPJ.addEventListener('input', () => mascaraCNPJ(inputCNPJ));
        }

        const inputTel = document.getElementById('novo-forn-tel');
        if (inputTel) {
            inputTel.addEventListener('input', () => mascaraTelefone(inputTel));
        }

        // Listeners de Teclado para Enter
        document.addEventListener('keydown', function (event) {
            const telaNovo = document.getElementById('view-novo');
            if (telaNovo && !telaNovo.classList.contains('hidden') && telaNovo.offsetParent !== null) {
                if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
                    event.preventDefault();
                    const ordemCampos = ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat', 'boleto-status'];
                    const indexAtual = ordemCampos.indexOf(event.target.id);
                    if (indexAtual > -1 && indexAtual < ordemCampos.length - 1) {
                        document.getElementById(ordemCampos[indexAtual + 1]).focus();
                    } else if (indexAtual === ordemCampos.length - 1) {
                        salvarBoleto(event.ctrlKey);
                    }
                }
            }
        });
    }
});