/* ==========================================================================
   FARMÁCIA SYSTEM - MAIN APP
   Refatorado para Modularidade e Manutenção
   ========================================================================== */

/* 1. CONFIGURAÇÕES E CONSTANTES */
const CONFIG = {
    API_URL: '../api',
    ANIMATION_SPEED: 300,
    THEME_KEY: 'theme'
};

/* 2. ESTADO GLOBAL DA APLICAÇÃO */
const State = {
    usuario: null,
    unidadeAtiva: null,          // { id, nome } da unidade ativa na sessão
    paginaAtualFinanceiro: 1,
    totalPaginasFinanceiro: 1,
    chartMes: null,
    chartCat: null,
    fornecedoresCache: [],
    buscaTimeout: null,
    fluxoCache: null,
    ordenacao: { campo: 'vencimento', dir: 'ASC' }
};

/* ==========================================================================
   MÓDULO: UTILS (Formatadores e Helpers Puros)
   ========================================================================== */
const Utils = {
    /**
     * Formata float para BRL.
     * Ex: 10.5 -> "R$ 10,50"
     */
    formatarMoedaBRL(valor) {
        // Garante que é número, trata possíveis strings vindas da API
        const numero = parseFloat(valor);
        if (isNaN(numero)) return 'R$ 0,00';
        
        return numero.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    },

    /**
     * Converte Input mascarado (R$ 1.234,56) para float (1234.56).
     * Essencial para enviar JSON limpo para o PHP.
     */
    converterMoedaParaFloat(valorString) {
        if (!valorString) return 0.00;
        if (typeof valorString === 'number') return valorString;
        
        // Remove tudo que não for dígito ou vírgula decimal
        const limpo = valorString.replace(/[^\d,]/g, '').replace(',', '.');
        return parseFloat(limpo) || 0.00;
    },

    formatarDataBR(dataISO) {
        if (!dataISO) return '-';
        // Previne erro de fuso horário convertendo string direta
        const [ano, mes, dia] = dataISO.split(' ')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    },

    debounce(func, delay) {
        clearTimeout(State.buscaTimeout);
        State.buscaTimeout = setTimeout(func, delay);
    }
};
/* ==========================================================================
   MÓDULO: UI (Interação com DOM e Feedback)
   ========================================================================== */
const UI = {
    LoaderHTML: `<tr><td colspan="100%" class="text-center py-4"><div class="loader-spinner"></div> Carregando...</td></tr>`,

    showToast(mensagem, tipo = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.innerHTML = `<span class="toast-icon">${tipo === 'success' ? '✅' : '⚠️'}</span><span class="toast-msg">${mensagem}</span>`;

        container.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        sidebar.classList.toggle('active');
        overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
    },

    toggleDarkMode() {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem(CONFIG.THEME_KEY, newTheme);

        // Sincroniza o switch se ele existir na tela
        const switchEl = document.getElementById('theme-switch');
        if (switchEl) switchEl.checked = (newTheme === 'dark');
    },

    toggleSenha() {
        const x = document.getElementById('login-pass');
        x.type = x.type === 'password' ? 'text' : 'password';
    },
    toggleSenhaPerfil() {
        const x = document.getElementById('conf-senha');
        x.type = x.type === 'password' ? 'text' : 'password';
    },

    alternarTelas(tela) {
        document.getElementById('login-screen').classList.toggle('hidden', tela !== 'login');
        document.getElementById('app-screen').classList.toggle('hidden', tela === 'login');
    },

    navegar(telaId, elementoBtn = null) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

        const viewAlvo = document.getElementById(`view-${telaId}`);
        if (viewAlvo) {
            viewAlvo.classList.remove('hidden');

            const rotas = {
                'dashboard': () => Dashboard.carregar(),
                'lista': () => Financeiro.carregar(1),
                'fluxo': () => Fluxo.carregar(),
                'logs': () => Admin.carregarLogs(),
                'config': () => Config.carregar(),
                'novo': () => Financeiro.prepararNovo()
            };
            if (rotas[telaId]) rotas[telaId]();
        }

        // Atualiza Menu
        document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));

        if (elementoBtn) {
            // Se o elemento foi passado pelo 'this', usa-o diretamente (MUITO MAIS RÁPIDO)
            elementoBtn.classList.add('active');
        } else {
            // Fallback: Se a navegação foi via código (ex: redirecionamento), busca no DOM
            const btnAtivo = document.querySelector(`.menu-item[onclick*="'${telaId}'"]`);
            if (btnAtivo) btnAtivo.classList.add('active');
        }

        // Fecha sidebar mobile (mantido)
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth < 768 && sidebar.classList.contains('active')) {
            UI.toggleSidebar();
        }
    },

    // Máscaras de Input
    Masks: {
        moeda(input) {
            let v = input.value.replace(/\D/g, '');
            v = (v / 100).toFixed(2) + '';
            input.value = "R$ " + v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
        },

        cnpj(input) {
            let v = input.value.replace(/\D/g, '').substring(0, 14);
            v = v.replace(/^(\d{2})(\d)/, "$1.$2")
                .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
                .replace(/\.(\d{3})(\d)/, ".$1/$2")
                .replace(/(\d{4})(\d)/, "$1-$2");
            input.value = v;
        },

        telefone(input) {
            let v = input.value.replace(/\D/g, "").substring(0, 11);
            if (v.length > 10) {
                v = v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
            } else if (v.length > 5) {
                v = v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
            } else if (v.length > 2) {
                v = v.replace(/^(\d\d)(\d{0,5})/, "($1) $2");
            }
            input.value = v;
        }
    }
};

/* ==========================================================================
   MÓDULO: API (Comunicação)
   ========================================================================== */
const API = {
    async request(url, method = 'GET', body = null) {
        const endpoint = url.startsWith('/') ? url.substring(1) : url;
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
                console.error("Erro API (Não JSON):", response.status);
                return null;
            }

            if (response.status === 401) {
                UI.showToast("Sessão expirada.", "error");
                setTimeout(() => window.location.reload(), 2000);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error("Erro Fetch:", error.message);
            return null;
        }
    }
};

/* ==========================================================================
   MÓDULO: AUTH (Autenticação)
   ========================================================================== */
const Auth = {
    async verificarSessao() {
        const data = await API.request('auth.php?action=check');
        if (data && data.id) {
            Auth.iniciarApp(data);
            return true;
        }
        UI.alternarTelas('login');
        return false;
    },

    iniciarApp(dadosUsuario) {
        State.usuario = dadosUsuario;
        sessionStorage.setItem('user_role', dadosUsuario.funcao);

        // Unidade ativa
        if (dadosUsuario.unidade_ativa) {
            State.unidadeAtiva = dadosUsuario.unidade_ativa;
        }

        const userDisplay = document.getElementById('user-display');
        const userRole = document.getElementById('user-role');
        if (userDisplay) userDisplay.innerText = dadosUsuario.nome;
        if (userRole) userRole.innerText = dadosUsuario.funcao === 'Admin' ? 'Administrador' : 'Operador';

        // Sync avatar initial letter
        const avatarEl = document.getElementById('avatar-icon');
        if (avatarEl && dadosUsuario.nome) avatarEl.innerText = dadosUsuario.nome.charAt(0).toUpperCase();

        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = dadosUsuario.funcao === 'Admin' ? 'block' : 'none';
        });

        // Seletor de unidades (sidebar/header — só visível se o usuário tiver >1 unidade)
        if (dadosUsuario.unidades && dadosUsuario.unidade_ativa) {
            Unidades.popularSeletor(dadosUsuario.unidades, dadosUsuario.unidade_ativa.id);
        }

        UI.alternarTelas('app');
        Config.carregarFornecedores(); // Cache background
        UI.navegar('dashboard');
    },

    async login(event) {
        if (event) event.preventDefault();
        const userVal = document.getElementById('login-user').value;
        const passVal = document.getElementById('login-pass').value;
        const btn = document.getElementById('btn-entrar');

        if (!userVal || !passVal) return UI.showToast("Preencha usuário e senha.", "error");

        const textoOriginal = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Entrando...";

        try {
            const res = await API.request('auth.php', 'POST', { usuario: userVal, senha: passVal });

            if (res && res.success) {
                UI.showToast(`Bem-vindo, ${res.nome}!`);
                State.fluxoCache = res;
                Auth.iniciarApp(res);
            } else {
                UI.showToast(res?.message || "Credenciais inválidas.", "error");
            }
        } catch (e) {
            UI.showToast("Erro no Login.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = textoOriginal;
        }
    },

    async logout() {
        await API.request('auth.php?action=logout');
        State.usuario = null;
        sessionStorage.clear();
        UI.alternarTelas('login');
        document.getElementById('modal-logout').classList.add('hidden');
    }
};

/* ==========================================================================
   MÓDULO: DASHBOARD
   ========================================================================== */
const Dashboard = {
    async carregar(periodo = '7d') {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.filter-btn[onclick*="'${periodo}'"]`);
        if (btn) btn.classList.add('active');

        const dados = await API.request(`dashboard.php?periodo=${periodo}`);
        
        // Proteção contra erros de rede
        if (!dados || dados.success === false) return;

        // Atualiza Cards
        if (dados.cards) {
            const map = {
                'card-pagar-mes': dados.cards.pagar_mes,
                'card-pago-mes': dados.cards.pago_mes,
                'card-vencidos-val': dados.cards.vencidos_val,
                'card-proximos-val': dados.cards.proximos_val,
                'card-fluxo-saldo': dados.cards.saldo_mes,
                'card-fluxo-ent': dados.cards.entradas_mes,
                'card-fluxo-sai': dados.cards.saidas_totais_mes
            };
            for (const [id, val] of Object.entries(map)) {
                const el = document.getElementById(id);
                if (el) el.innerText = Utils.formatarMoedaBRL(val);
            }
            const elVencQtd = document.getElementById('card-vencidos-qtd');
            if (elVencQtd) elVencQtd.innerText = dados.cards.vencidos_qtd;
            
            const elProxQtd = document.getElementById('card-proximos-qtd');
            if (elProxQtd) elProxQtd.innerText = dados.cards.proximos_qtd;
        }

        Dashboard.renderizarGraficos(dados.graficos);
        Dashboard.renderizarCalendario(dados.calendario);
    },

    renderizarGraficos(dados) {
        if (!dados || typeof Chart === 'undefined') return;

        // Fonte padrão para os gráficos
        Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
        Chart.defaults.color = '#64748b'; // var(--text-light)

        // ==========================================
        // 1. Gráfico de Evolução (Linha com Gradiente)
        // ==========================================
        const ctxMes = document.getElementById('chartMes');
        if (ctxMes) {
            if (State.chartMes) State.chartMes.destroy();
            
            // Criar Gradiente suave para o preenchimento
            const ctx2d = ctxMes.getContext('2d');
            const gradient = ctx2d.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.25)'); // Azul primário mais visível no topo
            gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');  // Transparente na base

            State.chartMes = new Chart(ctxMes, {
                type: 'line',
                data: {
                    labels: dados.por_mes.map(d => d.mes),
                    datasets: [{
                        label: 'Total Movimentado',
                        data: dados.por_mes.map(d => d.total),
                        borderColor: '#2563eb', // var(--primary)
                        backgroundColor: gradient,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4, // Curva suave
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#2563eb',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#2563eb',
                        pointHoverBorderColor: '#ffffff',
                        pointHoverBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: { display: false }, // Ocultamos a legenda para um visual mais limpo
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)', // Tooltip dark moderna
                            titleFont: { size: 13 },
                            bodyFont: { size: 14, weight: 'bold' },
                            padding: 12,
                            cornerRadius: 8,
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    let val = context.parsed.y;
                                    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false, drawBorder: false }, // Remove grid vertical
                        },
                        y: {
                            grid: { color: 'rgba(0, 0, 0, 0.04)', drawBorder: false }, // Grid horizontal extra leve
                            border: { dash: [4, 4] }, // Grid tracejado
                            ticks: {
                                padding: 10,
                                callback: function(value) {
                                    return 'R$ ' + (value >= 1000 ? (value/1000).toFixed(1) + 'k' : value);
                                }
                            },
                            beginAtZero: true
                        }
                    },
                    animation: { duration: 1000, easing: 'easeOutQuart' } // Transição suave SaaS
                }
            });
        }

        // ==========================================
        // 2. Gráfico de Categorias (Donut)
        // ==========================================
        const ctxCat = document.getElementById('chartCat');
        if (ctxCat) {
            if (State.chartCat) State.chartCat.destroy();
            
            // Paleta de cores moderna (Vercel / Stripe vibe)
            const modernPalette = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
            
            State.chartCat = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels: dados.por_categoria.map(d => d.categoria),
                    datasets: [{
                        data: dados.por_categoria.map(d => d.total),
                        backgroundColor: modernPalette,
                        borderWidth: 0, // Sem borda interna para visual contínuo
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%', // Raio interno (Anel elegante)
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                usePointStyle: true,
                                pointStyle: 'circle',
                                padding: 20,
                                font: { size: 12, weight: '500' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            bodyFont: { size: 14, weight: 'bold' },
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: function(context) {
                                    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                                    // Calcula a porcentagem para exibir na tooltip
                                    const total = context.chart._metasets[context.datasetIndex].total;
                                    const perc = ((context.raw / total) * 100).toFixed(1) + '%';
                                    return ` ${valor} (${perc})`;
                                }
                            }
                        }
                    },
                    animation: { animateScale: true, animateRotate: true, duration: 1000, easing: 'easeOutQuart' }
                }
            });
        }
    },

    renderizarCalendario(eventos) {
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
    },

    toggleSection() {
        const wrap = document.getElementById('calendar-wrapper');
        const header = document.querySelector('.toggle-header');

        if (wrap.style.display === 'none' || wrap.classList.contains('hidden-content')) {
            wrap.style.display = 'block';
            wrap.classList.remove('hidden-content');
            header.classList.add('open');
            Dashboard.carregar(); // Recarrega para ajustar tamanho
        } else {
            wrap.style.display = 'none';
            header.classList.remove('open');
        }
    }
};

/* ==========================================================================
   MÓDULO: FINANCEIRO (CRUD)
   ========================================================================== */
const Financeiro = {
    async carregar(pagina = 1) {
        State.paginaAtualFinanceiro = pagina;
        const tbody = document.querySelector('#tabela-registros tbody');
        tbody.innerHTML = UI.LoaderHTML;

        // Filtros
        const busca = document.getElementById('filtro-busca').value;
        const status = document.getElementById('filtro-status')?.value || 'Todos';
        const cat = document.getElementById('filtro-cat')?.value || 'Todas';
        const dIni = document.getElementById('filtro-data-inicio')?.value || '';
        const dFim = document.getElementById('filtro-data-fim')?.value || '';

        let url = `financeiro.php?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${status}&categoria=${encodeURIComponent(cat)}`;
        url += `&ordem=${State.ordenacao.campo}&dir=${State.ordenacao.dir}`;
        if (dIni) url += `&data_inicio=${dIni}`;
        if (dFim) url += `&data_fim=${dFim}`;

        const res = await API.request(url);
        tbody.innerHTML = '';

        if (!res || !res.registros || res.registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
            return;
        }

        document.getElementById('info-paginas').innerText = `Página ${pagina} de ${res.total_paginas}`;
        State.totalPaginasFinanceiro = res.total_paginas;
        const hojeStr = new Date().toLocaleDateString('en-CA');

        res.registros.forEach(r => {
            let statusClass = 'status-Pendente';
            let statusTexto = r.status;

            if (r.status === 'Pago') statusClass = 'status-Pago';
            else if (r.vencimento < hojeStr) {
                statusClass = 'status-Vencido';
                statusTexto = 'Vencido';
            }

            const temCodigo = r.codigo_barras && r.codigo_barras.length > 5;
            const btnCopy = temCodigo ? 
                `<button class="btn-icon btn-copy" onclick="Financeiro.copiarCodigo('${r.codigo_barras}')" title="Copiar Código">
                    <i data-lucide="copy"></i>
                </button>` : '';
            
            const tr = document.createElement('tr');
            if (statusTexto === 'Vencido') tr.classList.add('row-vencido');

            tr.innerHTML = `
                <td>${Utils.formatarDataBR(r.vencimento)}</td>
                <td>
                    ${r.descricao} 
                    ${temCodigo ? '<br><small style="color:#aaa; font-size:0.75rem;">'+r.codigo_barras+'</small>' : ''}
                </td>
                <td><span class="category-badge">${r.categoria}</span></td>
                <td style="font-weight: 500;">${Utils.formatarMoedaBRL(r.valor)}</td>
                <td><span class="status-badge ${statusClass}">${statusTexto}</span></td>
    
                <td class="text-right" style="white-space: nowrap;">
                    ${btnCopy}
                    <button class="btn-icon btn-link" onclick="Financeiro.abrirBanco()" title="Acessar Banco">
                        <i data-lucide="landmark"></i>
                    </button>
                    ${r.status !== 'Pago' ? 
                        `<button class="btn-icon btn-check" onclick="Financeiro.baixar(${r.id})" title="Confirmar Pagamento">
                            <i data-lucide="check-circle-2"></i>
                        </button>` : ''}
                    <button class="btn-icon btn-edit" onclick="Financeiro.editar(${r.id})" title="Editar">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn-icon btn-trash" onclick="Financeiro.excluir(${r.id})" title="Excluir">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // CORREÇÃO: Renderizar os ícones APÓS inserir todos os elementos na tela
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    prepararNovo() {
        document.getElementById('form-boleto').reset();
        document.getElementById('boleto-id-hidden').value = '';
        document.getElementById('form-titulo').innerText = 'Novo Registro';
        setTimeout(() => document.getElementById('boleto-cod').focus(), 100);
    },

    async salvar(event) {
        if (event && event.preventDefault) event.preventDefault();

        const campos = {
            desc: document.getElementById('boleto-desc'),
            valor: document.getElementById('boleto-valor'),
            venc: document.getElementById('boleto-venc'),
            cod: document.getElementById('boleto-cod'),
            cat: document.getElementById('boleto-cat'),
            status: document.getElementById('boleto-status')
        };

        if (!campos.desc.value || !campos.valor.value || !campos.venc.value) {
            return UI.showToast("Preencha descrição, valor e vencimento.", "error");
        }

        const payload = {
            descricao: campos.desc.value,
            valor: Utils.converterMoedaParaFloat(campos.valor.value),
            vencimento: campos.venc.value,
            categoria: campos.cat.value || "Outros",
            status: campos.status.value,
            codigo_barras: campos.cod.value
        };

        const btnSalvar = document.querySelector('#view-novo button[onclick*="salvarBoleto"]');
        if(btnSalvar) btnSalvar.disabled = true;

        const res = await API.request('financeiro.php?action=salvar', 'POST', payload);

        if(btnSalvar) btnSalvar.disabled = false;

        if (res && res.success) {
            UI.showToast('Salvo com sucesso!');
            if (!event || event.type === 'submit') {
                Financeiro.prepararNovo();
            }
            Dashboard.carregar();
        } else {
            UI.showToast(res?.message || 'Erro desconhecido ao salvar.', 'error');
        }
    },

    async editar(id) {
        const res = await API.request(`financeiro.php?id=${id}`);
        if (res && res.id) {
            document.getElementById('edit-id').value = res.id;
            const codInput = document.getElementById('edit-cod');
            if (codInput) codInput.value = res.codigo_barras || '';

            document.getElementById('edit-desc').value = res.descricao;
            document.getElementById('edit-venc').value = res.vencimento;
            document.getElementById('edit-cat').value = res.categoria;
            document.getElementById('edit-status').value = res.status;
            document.getElementById('edit-valor').value = Utils.formatarMoedaBRL(res.valor);

            document.getElementById('modal-editar').classList.remove('hidden');
        }
    },

    async salvarEdicao() {
        const payload = {
            id: document.getElementById('edit-id').value,
            descricao: document.getElementById('edit-desc').value,
            valor: Utils.converterMoedaParaFloat(document.getElementById('edit-valor').value),
            vencimento: document.getElementById('edit-venc').value,
            categoria: document.getElementById('edit-cat').value,
            status: document.getElementById('edit-status').value,
            codigo_barras: document.getElementById('edit-cod')?.value || ''
        };

        if (!payload.descricao || payload.valor <= 0) return UI.showToast("Dados inválidos.", "error");

        const res = await API.request('financeiro.php', 'POST', payload);
        if (res && res.success) {
            UI.showToast("Atualizado!");
            Financeiro.fecharModalEdicao();
            Financeiro.carregar(State.paginaAtualFinanceiro); // Isso já vai recarregar os ícones corretamente
        } else {
            UI.showToast(res?.message || "Erro.", "error");
        }
    },

    async excluir(id) {
        if (!confirm("Tem certeza?")) return;
        const res = await API.request(`financeiro.php?action=excluir&id=${id}`, 'POST');
        if (res && res.success) {
            UI.showToast("Excluído.");
            Financeiro.carregar(State.paginaAtualFinanceiro);
        }
    },

    baixar(id) {
        // 1. Abre o modal em vez de dar baixa direta
        document.getElementById('baixa-id').value = id;
        
        // Define a data padrão como HOJE
        const hoje = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD garantido
        document.getElementById('baixa-data').value = hoje;
        
        // Reseta o select para o padrão
        document.getElementById('baixa-forma').value = 'Bancário';

        document.getElementById('modal-baixa').classList.remove('hidden');
    },
    fecharModalBaixa() {
        document.getElementById('modal-baixa').classList.add('hidden');
    },

    async confirmarBaixa() {
        const id = document.getElementById('baixa-id').value;
        const dataPagamento = document.getElementById('baixa-data').value;
        const formaPagamento = document.getElementById('baixa-forma').value;

        if (!dataPagamento) return UI.showToast("Informe a data.", "error");

        const btn = document.querySelector('#modal-baixa .btn-success');
        const txtOriginal = btn.innerText;
        btn.innerText = "Processando...";
        btn.disabled = true;

        const payload = { 
            id: id, 
            data_baixa: dataPagamento,
            forma_pagamento: formaPagamento 
        };

        const res = await API.request('financeiro.php?action=baixar', 'POST', payload);

        btn.innerText = txtOriginal;
        btn.disabled = false;

        if (res && res.success) {
            UI.showToast("Pagamento registrado!");
            Financeiro.fecharModalBaixa();
            Financeiro.carregar(State.paginaAtualFinanceiro);
            Dashboard.carregar(); // Atualiza dashboard com os novos dados
        } else {
            UI.showToast(res?.message || "Erro ao baixar.", "error");
        }
    },

    // Ações Auxiliares
    async lerCodigoBarras() {
        const inputCod = document.getElementById('boleto-cod');
        const codigo = inputCod.value.trim();
        
        // Só avança se tiver o tamanho mínimo de um código de barras
        if (codigo.length < 10) return;

        try {
            // Faz a validação matemática instantânea no PHP
            const res = await API.request('boleto.php', 'POST', { codigo: codigo });
            
            if (res && res.valido) {
                UI.showToast("Boleto processado!", "success");

                // 1. Preenchimento Automático: Valor
                if (res.valor > 0) {
                    document.getElementById('boleto-valor').value = Utils.formatarMoedaBRL(res.valor);
                }
                
                // 2. Preenchimento Automático: Vencimento
                if (res.vencimento) {
                    document.getElementById('boleto-venc').value = res.vencimento;
                    Financeiro.verificarVencimento();
                }

                // 3. Foco Automático na Descrição:
                // Limpa qualquer texto genérico e coloca o cursor pronto a escrever
                // LÓGICA DA ASSINATURA (O MOTOR)
                if (res.empresa_cobradora) {
                    // Já conhece a empresa!
                    document.getElementById('boleto-desc').value = res.empresa_cobradora;
                    Financeiro.verificarFornecedor(); 
                } else if (res.assinatura) {
                    // Tem assinatura nova, mas não conhece a empresa
                    Financeiro.abrirModalAssinatura(res.assinatura);
                } else {
                    // Não tem assinatura (ex: PIX Copia e Cola), foca na descrição
                    document.getElementById('boleto-desc').value = "";
                    document.getElementById('boleto-desc').focus();
                }

                // Tratamento para PIX Copia e Cola (mantido)
                if (res.tipo && res.tipo.includes('PIX')) {
                    const modalQR = document.getElementById('modal-qrcode');
                    const imgQR = document.getElementById('img-qrcode');
                    if (modalQR && imgQR) {
                        imgQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codigo)}`;
                        modalQR.classList.remove('hidden');
                        UI.showToast("QR Code PIX Gerado.", "success");
                    }
                }
            } else {
                UI.showToast(res?.mensagem || "Código inválido ou não reconhecido.", "error");
            }
        } catch (e) {
            UI.showToast("Erro ao processar o boleto.", "error");
        }
    },

    verificarVencimento() {
        const data = document.getElementById('boleto-venc').value;
        const aviso = document.getElementById('aviso-vencido');
        if (aviso && data) {
            const hoje = new Date().toISOString().split('T')[0];
            aviso.style.display = data < hoje ? 'block' : 'none';
        }
    },

    verificarFornecedor() {
        const descInput = document.getElementById('boleto-desc');
        const catSelect = document.getElementById('boleto-cat');

        if (!descInput || !catSelect) return;

        // Segurança: Se o cache estiver vazio (ex: reload da página), tenta recarregar
        if (!State.fornecedoresCache || State.fornecedoresCache.length === 0) {
            Config.carregarFornecedores();
            return;
        }

        const termo = descInput.value.trim().toLowerCase();
        if (!termo) return;

        // LÓGICA DE MATCH (SINCRONIZAÇÃO CACHE <-> DATALIST)

        // 1. Prioridade Total: Match Exato (Usuário clicou no Datalist)
        let encontrado = State.fornecedoresCache.find(f => f.nome.toLowerCase() === termo);

        // 2. Fallback: Match Parcial Inteligente
        // Ordenamos por tamanho do nome (decrescente) para evitar que "Cimed" (curto)
        // seja detectado dentro de "Pagamento Cimed Distribuidora" antes de "Cimed Distribuidora" (longo).
        if (!encontrado) {
            const cacheOrdenado = [...State.fornecedoresCache].sort((a, b) => b.nome.length - a.nome.length);
            encontrado = cacheOrdenado.find(f => termo.includes(f.nome.toLowerCase()));
        }

        // 3. Aplicação
        if (encontrado && encontrado.categoriaPadrao) {
            // Só altera se for diferente para permitir que o usuário mude manualmente depois sem ser sobrescrito
            if (catSelect.value !== encontrado.categoriaPadrao) {
                catSelect.value = encontrado.categoriaPadrao;

                // Feedback visual: Pisca a borda do select em verde
                catSelect.style.transition = "border-color 0.3s";
                const bordaOriginal = catSelect.style.borderColor;
                catSelect.style.borderColor = "var(--success)";
                setTimeout(() => catSelect.style.borderColor = bordaOriginal, 800);
            }
        }
    },

    copiarCodigo(cod) {
        navigator.clipboard.writeText(cod)
            .then(() => UI.showToast("Copiado!"))
            .catch(() => UI.showToast("Erro ao copiar.", "error"));
    },

    abrirBanco() {
        window.open('https://internetbanking.caixa.gov.br/', '_blank');
    },

    fecharModalEdicao() {
        document.getElementById('modal-editar').classList.add('hidden');
    },

    fecharModalQR() {
        document.getElementById('modal-qrcode').classList.add('hidden');
    },

    abrirModalAssinatura(assinatura) {
        document.getElementById('assinatura-detectada').value = assinatura;
        document.getElementById('assinatura-nome').value = '';
        
        // Copia as opções do select original para o select do modal
        const catSelect = document.getElementById('assinatura-cat');
        catSelect.innerHTML = document.getElementById('boleto-cat').innerHTML;
        
        document.getElementById('modal-nova-assinatura').classList.remove('hidden');
        setTimeout(() => document.getElementById('assinatura-nome').focus(), 100);
    },

    fecharModalAssinatura() {
        document.getElementById('modal-nova-assinatura').classList.add('hidden');
        document.getElementById('boleto-desc').focus(); // Volta o foco para o input principal
    },

    async salvarAssinatura() {
        const assinatura = document.getElementById('assinatura-detectada').value;
        const nome = document.getElementById('assinatura-nome').value;
        const categoria = document.getElementById('assinatura-cat').value;

        if (!nome) return UI.showToast("Informe o nome do fornecedor.", "error");

        const btn = document.querySelector('#modal-nova-assinatura .btn-success');
        const txtOriginal = btn.innerText;
        btn.innerText = "Salvando..."; 
        btn.disabled = true;

        // Salva diretamente via endpoint de fornecedores
        const res = await API.request('assinaturas.php', 'POST', {
            assinatura: assinatura,
            nome: nome,
            categoria: categoria
        });

        btn.innerText = txtOriginal; 
        btn.disabled = false;

        if (res?.success) {
            UI.showToast("Assinatura aprendida com sucesso!", "success");
            
            // Preenche magicamente a tela principal de Novo Lançamento
            document.getElementById('boleto-desc').value = nome;
            if (categoria) document.getElementById('boleto-cat').value = categoria;

            Config.carregarFornecedores().then(() => Config.renderizarFornecedores());
            
            Financeiro.fecharModalAssinatura();
        } else {
            UI.showToast("Erro ao aprender assinatura.", "error");
        }
    },
};

/* ==========================================================================
   MÓDULO: FLUXO DE CAIXA
   ========================================================================== */
const Fluxo = {
    async carregar() {
        const mesInput = document.getElementById('filtro-mes-fluxo');
        if (!mesInput.value) {
            const hoje = new Date();
            mesInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        }

        const themeSwitch = document.getElementById('theme-switch');
        if (themeSwitch) {
            // Verifica se o body tem o atributo data-theme="dark"
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            themeSwitch.checked = isDark;
        }

        const tbody = document.querySelector('#tabela-fluxo tbody');
        tbody.innerHTML = UI.LoaderHTML;

        const res = await API.request(`fluxo.php?mes=${mesInput.value}`);
        tbody.innerHTML = '';

        if (res) {
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
            setVal('fluxo-entradas', res.total_entradas_fmt);
            setVal('fluxo-saidas', res.total_saidas_fmt);
            setVal('fluxo-saldo', res.saldo_fmt);

            const detalhe = document.getElementById('detalhe-entradas');
            if (detalhe) detalhe.innerText = `Din: ${res.total_dinheiro} | Pix: ${res.total_pix} | Cart: ${res.total_cartao}`;

            if (res.movimentacoes?.length > 0) {
                res.movimentacoes.forEach(mov => {
                    const tr = document.createElement('tr');
                    const isEntrada = mov.tipo === 'ENTRADA';
                    const cor = isEntrada ? 'text-success' : 'text-danger';
                    const sinal = isEntrada ? '+' : '-';

                    tr.innerHTML = `
                        <td>${Utils.formatarDataBR(mov.data)}</td>
                        <td>${mov.descricao}</td>
                        <td><span class="category-badge">${mov.categoria || '-'}</span></td>
                        <td class="text-right font-weight-bold ${cor}">${sinal} ${Utils.formatarMoedaBRL(mov.valor)}</td>
                        <td class="no-print"></td>`;
                    // SEGURANÇA: nome via dataset evita quebra com aspas (ex: João D'Avila) e XSS
                const btnReset = tr.querySelector('.btn-reset-senha');
                btnReset.dataset.nome = u.nome;
                btnReset.addEventListener('click', function () {
                    Admin.modalReset(parseInt(this.dataset.id), this.dataset.nome);
                });

                tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma movimentação.</td></tr>';
            }
        }
    },

    async salvarMovimento(tipo) {
        const prefixo = tipo === 'entrada' ? 'ent' : 'sai';
        const elDesc = document.getElementById(`${prefixo}-desc`);
        const elValor = document.getElementById(`${prefixo}-valor`);
        const elData = document.getElementById(`${prefixo}-data`);
        const elForma = document.getElementById(`${prefixo}-forma`);

        if (!elDesc.value || !elValor.value || !elData.value) return UI.showToast("Preencha todos os campos.", "error");

        const payload = {
            descricao: elDesc.value,
            valor: Utils.converterMoedaParaFloat(elValor.value),
            data_registro: elData.value,
            tipo: tipo.toUpperCase(),
            forma_pagamento: elForma ? elForma.value : null
        };

        const res = await API.request('fluxo.php?action=salvar', 'POST', payload);
        if (res && res.success) {
            UI.showToast("Registrado!");
            elDesc.value = '';
            elValor.value = '';
            Fluxo.carregar();
        } else {
            UI.showToast(res?.message || "Erro.", "error");
        }
    },

    baixarExcel() {
        const mesInput = document.getElementById('filtro-mes-fluxo');
        let periodo = mesInput ? mesInput.value : '';

        // 1. Fallback Explícito: Se vazio, força o mês atual (consistente com carregarFluxo)
        if (!periodo) {
            const hoje = new Date();
            periodo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

            // Opcional: Feedback visual preenchendo o input se ele existir
            if (mesInput) mesInput.value = periodo;
        }

        // 2. Construção da URL com o parâmetro 'tipo=fluxo' obrigatório
        const url = `${CONFIG.API_URL}/exportar.php?tipo=fluxo&mes=${periodo}`;

        window.location.href = url;
    }
};

function filtrarFluxo(tipo) {
    // 1. Filtra Tabela (Lógica Visual Existente)
    const tbody = document.querySelector('#tabela-fluxo tbody');
    const linhas = tbody.querySelectorAll('tr');

    if (linhas.length === 0 || (linhas.length === 1 && linhas[0].innerText.includes('Nenhuma movimentação'))) {
        return;
    }

    linhas.forEach(tr => {
        const isEntrada = tr.innerHTML.includes('text-success'); // Identifica pela cor verde
        const isSaida = tr.innerHTML.includes('text-danger');    // Identifica pela cor vermelha

        if (tipo === 'todos') {
            tr.style.display = '';
        } else if (tipo === 'entrada') {
            tr.style.display = isEntrada ? '' : 'none';
        } else if (tipo === 'saida') {
            tr.style.display = isSaida ? '' : 'none';
        }
    });

    // 2. Atualiza Cards (Nova Lógica de Recálculo Visual)
    if (!State.fluxoCache) return;

    // Recupera valores originais do Cache
    const rawEnt = Utils.converterMoedaParaFloat(State.fluxoCache.total_entradas_fmt);
    const rawSai = Utils.converterMoedaParaFloat(State.fluxoCache.total_saidas_fmt);
    
    let txtEnt = State.fluxoCache.total_entradas_fmt;
    let txtSai = State.fluxoCache.total_saidas_fmt;
    let txtSaldo = State.fluxoCache.saldo_fmt;
    let txtStatus = "Balanço do mês";

    // Aplica a lógica do filtro nos Cards
    if (tipo === 'entrada') {
        txtSai = "R$ 0,00"; // Zera saídas
        txtSaldo = txtEnt;  // Saldo vira apenas o total de entradas
        txtStatus = "Filtro: Apenas Entradas";
    } 
    else if (tipo === 'saida') {
        txtEnt = "R$ 0,00"; // Zera entradas
        // Para saídas, o saldo líquido visual é negativo
        txtSaldo = Utils.formatarMoedaBRL(-rawSai); 
        txtStatus = "Filtro: Apenas Saídas";
    }

    // Renderiza nos elementos
    document.getElementById('fluxo-entradas').innerText = txtEnt;
    document.getElementById('fluxo-saidas').innerText = txtSai;
    document.getElementById('fluxo-saldo').innerText = txtSaldo;
    
    const elStatus = document.getElementById('fluxo-status-texto');
    if(elStatus) elStatus.innerText = txtStatus;
}

/* ==========================================================================
   MÓDULO: CONFIGURAÇÕES E ADMIN
   ========================================================================== */
const Config = {
    async carregar() {
        if (State.usuario) {
            const iLogin = document.getElementById('conf-login');
            const iNome = document.getElementById('conf-nome');
            if (iLogin) iLogin.value = State.usuario.usuario || State.usuario.login || '';
            if (iNome) iNome.value = State.usuario.nome || '';
        }
        await Config.carregarFornecedores();

        Config.renderizarFornecedores();
        Config.carregarCategorias();
        Admin.carregarUsuarios();

        // Carrega tabela e checkboxes de unidades (apenas para Admins)
        if (State.usuario?.funcao === 'Admin') {
            Unidades.carregar();
        }
    },

    async carregarCategorias() {
        const categorias = await API.request('categorias.php');
        if (!categorias || !Array.isArray(categorias)) return;

        ['filtro-cat', 'boleto-cat', 'edit-cat', 'novo-forn-cat'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const originalVal = el.value;
            const padrao = el.firstElementChild ? el.firstElementChild.cloneNode(true) : null;
            el.innerHTML = '';
            if (padrao) el.appendChild(padrao);

            categorias.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.nome;
                opt.textContent = cat.nome;
                el.appendChild(opt);
            });
            if (originalVal) el.value = originalVal;
        });

        // Renderiza lista na aba de configurações
        const container = document.getElementById('lista-categorias-config');
        if (container) {
            let html = '<div class="list-group mt-3">';
            categorias.forEach(cat => {
                html += `
                <div class="list-item-flex" style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="width:12px;height:12px;border-radius:50%;background-color:${cat.cor || '#3b82f6'};"></span>
                        <strong>${cat.nome}</strong>
                    </div>
                    <button class="btn-icon btn-trash" onclick="Config.excluirCategoria(${cat.id})" title="Excluir">🗑</button>
                </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    },

    adicionarCategoria() {
        const nomeInput = document.getElementById('new-cat-nome');
        const corInput = document.getElementById('new-cat-cor');
        
        // Reseta o formulário
        if (nomeInput) nomeInput.value = '';
        if (corInput) corInput.value = '#3b82f6'; // Azul padrão

        // Exibe o modal
        const modal = document.getElementById('modal-nova-categoria');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => nomeInput.focus(), 100);
        }
    },

    // 2. Fecha o Modal
    fecharModalCategoria() {
        document.getElementById('modal-nova-categoria').classList.add('hidden');
    },
    async salvarNovaCategoria() {
        const nomeVal = document.getElementById('new-cat-nome').value.trim();
        const corVal = document.getElementById('new-cat-cor').value;

        if (!nomeVal) {
            return UI.showToast("O nome da categoria é obrigatório.", "error");
        }

        const payload = { 
            nome: nomeVal,
            cor: corVal 
        };

        const res = await API.request('categorias.php', 'POST', payload);

        if (res?.success) {
            UI.showToast("Categoria criada com sucesso!", "success");
            Config.fecharModalCategoria();
            Config.carregarCategorias(); // Atualiza a lista na tela
        } else {
            UI.showToast(res?.message || "Erro ao criar categoria.", "error");
        }
    },

    async excluirCategoria(id) {
        if (!confirm("Remover categoria?")) return;
        const res = await API.request(`categorias.php?id=${id}`, 'DELETE');
        if (res?.success) {
            UI.showToast("Categoria removida.");
            Config.carregarCategorias();
        }
    },

    async resetarCategorias() {
        if (!confirm("Isso apagará todas as categorias personalizadas. Continuar?")) return;
        const res = await API.request('categorias.php?action=reset', 'POST', {});
        if (res?.success) {
            UI.showToast("Restaurado.");
            Config.carregarCategorias();
        }
    },

    async carregarFornecedores() {
        const res = await API.request('fornecedores.php');
        if (res && Array.isArray(res)) {
            State.fornecedoresCache = res;
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
    },

    renderizarFornecedores() {
        const tbody = document.getElementById('tbody-fornecedores');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (State.fornecedoresCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum fornecedor cadastrado.</td></tr>';
            return;
        }

        State.fornecedoresCache.forEach(f => {
            const tr = document.createElement('tr');
            // Mostra a assinatura com uma cor fraquinha para não poluir
            const txtAssinatura = f.assinatura ? `<br><small style="color:var(--text-light)">${f.assinatura}</small>` : '';
            
            tr.innerHTML = `<td>${f.nome} ${txtAssinatura}</td><td>${f.cnpj || '-'}</td><td>${f.telefone || '-'}</td>
                            <td class="text-right"><button class="btn-icon btn-trash" onclick="Config.excluirFornecedor(${f.id})">🗑</button></td>`;
            tbody.appendChild(tr);
        });
    },

    async salvarFornecedor() {
        const dados = {
            nome: document.getElementById('novo-forn-nome').value,
            cnpj: document.getElementById('novo-forn-cnpj').value,
            telefone: document.getElementById('novo-forn-tel').value,
            categoriaPadrao: document.getElementById('novo-forn-cat').value,
            assinatura: document.getElementById('novo-forn-assinatura').value // Pegando a assinatura manual
        };

        const res = await API.request('fornecedores.php', 'POST', dados);
        
        if (res?.success) {
            UI.showToast("Cadastrado!", "success");
            document.getElementById('novo-forn-nome').value = '';
            document.getElementById('novo-forn-cnpj').value = '';
            document.getElementById('novo-forn-tel').value = '';
            document.getElementById('novo-forn-assinatura').value = '';
            
            Config.carregarFornecedores().then(() => Config.renderizarFornecedores());
        } else {
            UI.showToast("Erro: " + (res?.message || res?.error || 'Desconhecido'), "error");
        }
    },

    async excluirFornecedor(id) {
        if (!confirm("Remover fornecedor?")) return;
        const res = await API.request(`fornecedores.php?id=${id}`, 'DELETE');
        if (res?.success) {
            UI.showToast("Removido.");
            await Config.carregarFornecedores();
            Config.renderizarFornecedores();
        }
    },

    async salvarPerfil() {
        const nome = document.getElementById('conf-nome').value;
        const senha = document.getElementById('conf-senha').value;
        const login = document.getElementById('conf-login').value;

        if (!nome) return UI.showToast("Nome obrigatório.", "error");

        const resPerfil = await API.request('admin.php?action=editar', 'POST', {
            id: State.usuario.id,
            nome: nome,
            login: login,
            funcao: State.usuario.funcao
        });

        if (resPerfil?.success) {
            let msg = "Perfil atualizado!";
            State.usuario.nome = nome;
            document.getElementById('user-display').innerText = nome;

            if (senha && senha.trim() !== "") {
                const resSenha = await API.request('admin.php?action=resetSenha', 'POST', {
                    id: State.usuario.id,
                    novaSenha: senha
                });
                if (resSenha?.success) {
                    msg += " E senha alterada.";
                    document.getElementById('conf-senha').value = '';
                }
            }
            UI.showToast(msg);
        } else {
            UI.showToast("Erro ao atualizar.", "error");
        }
    }
};

const Admin = {
    async carregarUsuarios() {
        const tbody = document.getElementById('tabela-usuarios-config');
        if (!tbody) return;

        const usuarios = await API.request('admin.php?resource=usuarios');
        tbody.innerHTML = '';

        if (usuarios && Array.isArray(usuarios)) {
            usuarios.forEach(u => {
                const tr = document.createElement('tr');
                const isSelf      = (State.usuario && u.id == State.usuario.id);
                const isTargetAdmin = (u.funcao === 'Admin');

                let deleteBtn;
                if (isSelf) {
                    deleteBtn = `<span class="btn-icon" style="opacity:0.3;cursor:not-allowed" title="Você não pode se excluir">🚫</span>`;
                } else if (isTargetAdmin) {
                    deleteBtn = `<span class="btn-icon" style="opacity:0.3;cursor:not-allowed" title="Não é permitido excluir Administradores">🚫</span>`;
                } else {
                    deleteBtn = `<button class="btn-icon btn-trash" onclick="Admin.excluirUsuario(${u.id})" title="Excluir">🗑</button>`;
                }

                // Unidades vinculadas ao usuário (campo opcional vindo da API)
                const unidadesTags = (u.unidades || [])
                    .map(un => `<span class="status-badge" style="font-size:.75em">${un.nome}</span>`)
                    .join(' ');

                tr.innerHTML = `
                    <td>${u.nome}</td>
                    <td>${u.usuario}</td>
                    <td><span class="status-badge">${u.funcao}</span></td>
                    <td>${unidadesTags || '<span style="color:var(--text-light);font-size:.8em">—</span>'}</td>
                    <td class="text-right">
                        <button class="btn-icon" onclick="Admin.modalEditarUsuario(${u.id})" title="Editar / Unidades">✏️</button>
                        <button class="btn-icon btn-reset-senha" data-id="${u.id}" title="Alterar Senha">🔑</button>
                        ${deleteBtn}
                    </td>`;
                // SEGURANÇA: nome via dataset evita quebra com aspas (ex: João D'Avila) e XSS
                const btnReset = tr.querySelector('.btn-reset-senha');
                btnReset.dataset.nome = u.nome;
                btnReset.addEventListener('click', function () {
                    Admin.modalReset(parseInt(this.dataset.id), this.dataset.nome);
                });

                tbody.appendChild(tr);
            });
        }
    },

    async excluirUsuario(id) {
        if (!confirm("Excluir permanentemente?")) return;
        const res = await API.request('admin.php?action=excluir', 'POST', { id: id });
        if (res?.success) {
            UI.showToast("Usuário excluído.");
            Admin.carregarUsuarios();
        } else {
            UI.showToast("Erro ao excluir.", "error");
        }
    },

    // ── Modal Editar Usuário + Unidades ──────────────────────────────────────
    async modalEditarUsuario(idUsuario) {
        // Faz as duas requisições em paralelo para ser mais rápido
        const [usuarios, todasUnidades] = await Promise.all([
            API.request('admin.php?resource=usuarios'),
            API.request('admin.php?resource=unidades')
        ]);

        if (!usuarios) return UI.showToast('Erro ao carregar utilizadores.', 'error');
        const u = usuarios.find(x => x.id == idUsuario);
        if (!u) return UI.showToast('Utilizador não encontrado.', 'error');

        const modal = document.getElementById('modal-editar-usuario');
        if (!modal) return;

        // Preenche os dados básicos no formulário
        document.getElementById('edit-user-id').value    = u.id;
        document.getElementById('edit-user-nome').value  = u.nome;
        document.getElementById('edit-user-login').value = u.usuario;
        document.getElementById('edit-user-funcao').value = u.funcao;

        // Renderiza checkboxes de unidades e marca as que o utilizador já tem
        const container = document.getElementById('edit-user-unidades');
        if (container) {
            if (!Array.isArray(todasUnidades) || todasUnidades.length === 0) {
                container.innerHTML = '<small style="color:var(--text-light)">Nenhuma unidade disponível.</small>';
            } else {
                // Extrai apenas os IDs das unidades que este utilizador já possui
                const vinculadas = (u.unidades || []).map(x => parseInt(x.id));

                container.innerHTML = todasUnidades.map(un => `
                    <label style="display:flex;align-items:center;gap:6px;padding:4px 0; cursor:pointer;">
                        <input type="checkbox" name="edit-unidade" value="${un.id}"
                            ${vinculadas.includes(parseInt(un.id)) ? 'checked' : ''}>
                        ${un.nome}
                    </label>`).join('');
            }
        }

        modal.classList.remove('hidden');
    },

    fecharModalEditarUsuario() {
        document.getElementById('modal-editar-usuario')?.classList.add('hidden');
    },

    async salvarEdicaoUsuario() {
        const id     = document.getElementById('edit-user-id').value;
        const nome   = document.getElementById('edit-user-nome').value.trim();
        const login  = document.getElementById('edit-user-login').value.trim();
        const funcao = document.getElementById('edit-user-funcao').value;

        if (!nome || !login) return UI.showToast('Nome e login são obrigatórios.', 'error');

        // Coleta TODAS as unidades que o Admin deixou marcadas no modal
        const checks   = document.querySelectorAll('input[name="edit-unidade"]:checked');
        const unidades = Array.from(checks).map(c => parseInt(c.value));
        
        if (unidades.length === 0) {
            return UI.showToast('O utilizador precisa de ter acesso a pelo menos uma unidade.', 'error');
        }

        // Envia para o PHP a array de "unidades" recém-escolhida
        const res = await API.request('admin.php?action=editar', 'POST', { id, nome, login, funcao, unidades });
        
        if (res?.success) {
            UI.showToast('Acessos do utilizador atualizados!');
            Admin.fecharModalEditarUsuario();
            Admin.carregarUsuarios(); // Atualiza a tabela imediatamente
        } else {
            UI.showToast(res?.message || 'Erro ao guardar.', 'error');
        }
    },

    modalReset(id, nome) {
        document.getElementById('reset-id-user').value = id;
        document.getElementById('reset-nome-user').innerText = nome;
        document.getElementById('modal-reset-senha').classList.remove('hidden');
    },

    fecharModalReset() {
        document.getElementById('modal-reset-senha').classList.add('hidden');
    },

    async confirmarResetSenha() {
        const id = document.getElementById('reset-id-user').value;
        const senha = document.getElementById('reset-nova-senha').value;
        if (!senha) return UI.showToast("Senha obrigatória.", "error");

        const res = await API.request('admin.php?action=resetSenha', 'POST', { id: id, novaSenha: senha });
        if (res?.success) {
            UI.showToast("Senha alterada!");
            document.getElementById('reset-nova-senha').value = '';
            Admin.fecharModalReset();
        } else {
            UI.showToast("Erro.", "error");
        }
    },

    async carregarLogs() {
        const tbody = document.querySelector('#tabela-logs tbody');
        if (!tbody) return;
        tbody.innerHTML = UI.LoaderHTML;

        const res = await API.request('admin.php?resource=logs');
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
                <td style="font-size:0.85em; color:var(--text-light)">${log.detalhes || '-'}</td>`;
            tbody.appendChild(tr);
        });
    }
};

async function criarNovoUsuario() {
    const nomeInput  = document.getElementById('novo-user-nome');
    const loginInput = document.getElementById('novo-user-login');
    const senhaInput = document.getElementById('novo-user-senha');
    const funcaoInput = document.getElementById('novo-user-funcao');

    if (!nomeInput.value || !loginInput.value || !senhaInput.value) {
        return UI.showToast('Preencha nome, login e senha.', 'error');
    }

    // Coleta unidades marcadas no formulário de criação
    const unidadeChecks = document.querySelectorAll('input[name="novo-unidade"]:checked');
    const unidades = Array.from(unidadeChecks).map(c => parseInt(c.value));
    // Se nenhuma marcada, a API usará a unidade ativa como padrão

    const payload = {
        nome:     nomeInput.value.trim(),
        login:    loginInput.value.trim(),
        password: senhaInput.value,
        nivel:    funcaoInput.value,
        unidades: unidades
    };

    const btn = document.querySelector('button[onclick="criarNovoUsuario()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = 'Salvando...';
    btn.disabled = true;

    const res = await API.request('admin.php?action=criarUsuario', 'POST', payload);

    btn.innerText = textoOriginal;
    btn.disabled = false;

    if (res && res.success) {
        UI.showToast('Usuário cadastrado com sucesso!');
        nomeInput.value  = '';
        loginInput.value = '';
        senhaInput.value = '';
        funcaoInput.value = 'Operador';
        // Limpa checkboxes de unidades
        document.querySelectorAll('input[name="novo-unidade"]').forEach(c => c.checked = false);
        Admin.carregarUsuarios();
    } else {
        UI.showToast(res?.message || 'Erro ao criar usuário.', 'error');
    }
}

/* ==========================================================================
   FUNÇÕES DETALHES GERAIS
   ========================================================================== */
async function verDetalhes(tipo, titulo) {
    document.getElementById('modal-titulo').innerText = titulo;
    document.getElementById('modal-detalhes').classList.remove('hidden');
    const tbody = document.querySelector('#tabela-modal tbody');
    tbody.innerHTML = UI.LoaderHTML;

    const hoje = new Date().toISOString().split('T')[0];
    let url = 'financeiro.php?pagina=1&limite=50';

    if (tipo === 'proximos') {
        const futuro = new Date();
        futuro.setDate(futuro.getDate() + 7);
        url += `&status=Pendente&data_inicio=${hoje}&data_fim=${futuro.toISOString().split('T')[0]}`;
    } else if (tipo === 'vencidos') {
        url += `&status=Vencido`;
    }

    const res = await API.request(url);
    tbody.innerHTML = '';

    if (res?.registros?.length > 0) {
        res.registros.forEach(r => {
            const badgeClass = r.status === 'Pago' ? 'status-Pago' : (r.status === 'Vencido' ? 'status-Vencido' : 'status-Pendente');
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${Utils.formatarDataBR(r.vencimento)}</td><td>${r.descricao}</td>
                            <td>${Utils.formatarMoedaBRL(r.valor)}</td><td><span class="status-badge ${badgeClass}">${r.status}</span></td>`;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum registro.</td></tr>';
    }
}

function preFiltrarLista(status) {
    // Define o valor no select
    const el = document.getElementById('filtro-status');
    if (el) el.value = status;

    // Navega para a lista (isso já dispara o carregamento da tabela)
    // Nota: Passamos null no segundo argumento pois não há botão de menu clicado aqui
    UI.navegar('lista', null);
}

/* ==========================================================================
   MÓDULO: UNIDADES — Seletor de unidade ativa + CRUD de unidades
   ========================================================================== */
const Unidades = {
    // ── Seletor no sidebar/header ──────────────────────────────────────────
    popularSeletor(unidades, ativaId) {
        const menu = document.getElementById('lista-unidades-dropdown');
        const label = document.getElementById('label-unidade-ativa');
        if (!menu || !label) return;

        menu.innerHTML = '';
        unidades.forEach(u => {
            if (u.id == ativaId) {
                label.textContent = u.nome;
            }
            const item = document.createElement('div');
            item.className = `dropdown-item ${u.id == ativaId ? 'active' : ''}`; 
            item.textContent = u.nome; item.onclick = () => {
                Unidades.trocar(u.id);
                Unidades.toggleDropdown(false);
            };
            menu.appendChild(item);
        });

        // Mostra o wrapper só se houver >1 unidade
        const wrapper = document.getElementById('seletor-unidade-wrapper');
        if (wrapper) {
            wrapper.style.display = 'block'; // sempre visível
            const btn = wrapper.querySelector('.dropdown-toggle'); // botão/seta
            if (btn) btn.style.display = unidades.length > 1 ? 'inline-flex' : 'none';
        }
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    toggleDropdown(forceState) {
        const dropdown = document.getElementById('unidade-dropdown');
        if (!dropdown) return;
        if (typeof forceState === 'boolean') {
            dropdown.classList.toggle('open', forceState);
        } else {
            dropdown.classList.toggle('open');
        }
    },

    // ── Troca a unidade ativa (chama auth.php) ────────────────────────────
    async trocar(idUnidade) {
        if (!idUnidade) return;
        const res = await API.request('auth.php?action=trocar_unidade', 'POST', { id_unidade: parseInt(idUnidade) });
        if (res && res.success) {
            State.unidadeAtiva      = res.unidade_ativa;
            State.fornecedoresCache = [];
            State.fluxoCache        = null;

            const check = await API.request('auth.php?action=check');
            if (check?.success) {
                State.usuario = check;
                Unidades.popularSeletor(check.unidades, idUnidade);
            }

            UI.showToast(`Unidade: ${res.unidade_ativa?.nome ?? ''}`, 'success');

            const secaoActiva = document.querySelector('.view-section:not(.hidden)');
            const telaId = secaoActiva ? secaoActiva.id.replace('view-', '') : 'dashboard';

            const refreshTasks = [
                Dashboard.carregar(),
                Financeiro.carregar(1),
                Fluxo.carregar(),
                Config.carregarFornecedores()
            ];

            await Promise.allSettled(refreshTasks);

            const btnAtivo = document.querySelector(`.menu-item[onclick*="'${telaId}'"]`);
            document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
            if (btnAtivo) btnAtivo.classList.add('active');

        } else {
            UI.showToast(res?.message || 'Erro ao trocar de unidade.', 'error');
        }
    },

    // ── CRUD de unidades (tela Configurações > Unidades) ──────────────────
    async carregar() {
        const tbody = document.getElementById('tabela-unidades');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Carregando...</td></tr>';

        const lista = await API.request('admin.php?resource=unidades');
        tbody.innerHTML = '';

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color:var(--text-light)">Nenhuma unidade cadastrada.</td></tr>';
            return;
        }

        lista.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td><strong>${u.nome}</strong></td>
                <td class="text-right">
                    <button class="btn-icon btn-trash" onclick="Unidades.excluir(${u.id}, '${u.nome.replace(/'/g,"\\'")}')">🗑</button>
                </td>`;
            tbody.appendChild(tr);
        });

        Unidades.preencherCheckboxes(lista);
    },

    preencherCheckboxes(lista) {
        ['novo-unidades-container', 'edit-unidades-container'].forEach(containerId => {
            const name = containerId === 'edit-unidades-container' ? 'edit-unidade' : 'novo-unidade';
            
            // Adicione esta linha que estava faltando para buscar o elemento no DOM
            const container = document.getElementById(containerId);
            
            if (!container || container.dataset.loaded === 'true') return;
            
            container.innerHTML = lista.map(u => `
                <label style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer">
                    <input type="checkbox" name="${name}" value="${u.id}"
                        ${u.id === State.unidadeAtiva?.id ? 'checked' : ''}>
                    ${u.nome}
                </label>`).join('');
            container.dataset.loaded = 'true';
        });
    },

    async criar() {
        const input = document.getElementById('nova-unidade-nome');
        const nome  = input?.value?.trim();
        if (!nome) return UI.showToast('Informe o nome da unidade.', 'error');

        const res = await API.request('admin.php?action=criarUnidade', 'POST', { nome });
        if (res?.success) {
            UI.showToast('Unidade criada!');
            input.value = '';
            
            ['novo-unidades-container', 'edit-unidades-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.dataset.loaded = 'false';
            });
            Unidades.carregar();
            
            // Força a validação da sessão para baixar as novas unidades e renderizar o menu instantaneamente
            await Auth.verificarSessao();
            Unidades.carregar();
        } else {
            UI.showToast(res?.message || 'Erro ao criar unidade.', 'error');
        }
    },

    async excluir(id, nome) {
        if (!confirm(`Excluir a unidade "${nome}"? Os registros vinculados perderão a associação.`)) return;
        const res = await API.request('admin.php?action=excluirUnidade', 'POST', { id });
        if (res?.success) {
            UI.showToast('Unidade removida.');
            await Auth.verificarSessao();
            Unidades.carregar();
        } else {
            UI.showToast(res?.message || 'Não foi possível remover.', 'error');
        }
    }
};

// Fechar o dropdown ao clicar fora
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('unidade-dropdown');
    if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target)) {
        Unidades.toggleDropdown(false);
    }
});

/* ==========================================================================
   CONECTORES GLOBAIS (Compatibility Layer)
   ========================================================================== */
// Expondo funções para o onclick do HTML
window.nav = UI.navegar;
window.toggleSidebar = UI.toggleSidebar;
window.toggleDarkMode = UI.toggleDarkMode;
window.toggleSenha = UI.toggleSenha;
window.toggleSenhaPerfil = UI.toggleSenhaPerfil;
window.fazerLogin = Auth.login;
window.confirmarLogout = () => document.getElementById('modal-logout').classList.remove('hidden');
window.fecharModalLogout = () => document.getElementById('modal-logout').classList.add('hidden');
window.fazerLogoutReal = Auth.logout;
window.filtrarDashboard = function(periodo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    Dashboard.carregar(periodo);
};
window.toggleCalendarSection = Dashboard.toggleSection;
window.verDetalhes = verDetalhes; // Função helper solta
window.preFiltrarLista = preFiltrarLista; // Função helper solta
window.carregarFluxo = Fluxo.carregar;
window.baixarExcelFluxo = Fluxo.baixarExcel;
window.filtrarFluxo = filtrarFluxo;
window.salvarEntradaCaixa = () => Fluxo.salvarMovimento('entrada');
window.salvarSaidaCaixa = () => Fluxo.salvarMovimento('saida');
window.lerCodigoBarras = Financeiro.lerCodigoBarras;
window.verificarFornecedorPreenchido = Financeiro.verificarFornecedor;
window.verificarVencimento = Financeiro.verificarVencimento;
window.limparFormulario = Financeiro.prepararNovo;
window.salvarBoleto = Financeiro.salvar;
window.carregarLista = Financeiro.carregar;
window.debounceCarregarLista = () => Utils.debounce(() => Financeiro.carregar(1), 500);
window.mudarPagina = (d) => {
    const nova = State.paginaAtualFinanceiro + d;
    if (nova > 0 && nova <= State.totalPaginasFinanceiro) Financeiro.carregar(nova);
};
window.editarRegistro = Financeiro.editar;
window.excluirRegistro = Financeiro.excluir;
window.baixarRegistro = Financeiro.baixar;
window.fecharModalEdicao = Financeiro.fecharModalEdicao;
window.salvarEdicao = Financeiro.salvarEdicao;
window.fecharModalQR = Financeiro.fecharModalQR;
window.fecharModal = () => document.getElementById('modal-detalhes').classList.add('hidden');
window.cadastrarFornecedor = Config.salvarFornecedor;
window.excluirFornecedor = Config.excluirFornecedor;
window.adicionarCategoriaPersonalizada = Config.adicionarCategoria;
window.resetarCategorias = Config.resetarCategorias;
window.excluirCategoria = Config.excluirCategoria;
window.criarNovoUsuario = criarNovoUsuario;
window.abrirModalReset = Admin.modalReset;
window.fecharModalReset = Admin.fecharModalReset;
window.confirmarResetSenha = Admin.confirmarResetSenha;
window.excluirUsuario = Admin.excluirUsuario;
window.salvarConfiguracoes = Config.salvarPerfil;
window.mascaraMoeda = UI.Masks.moeda;
window.mascaraCNPJ = UI.Masks.cnpj;
window.mascaraTelefone = UI.Masks.telefone;
window.copiarCodigo = Financeiro.copiarCodigo; // Adicionado
window.abrirBanco = Financeiro.abrirBanco; // Adicionado
// Unidades
window.trocarUnidadeAtual          = (id) => Unidades.trocar(id);
window.criarUnidade                = () => Unidades.criar();
window.excluirUnidade              = (id, nome) => Unidades.excluir(id, nome);
window.carregarUnidades            = () => Unidades.carregar();
// Modal editar usuário
window.modalEditarUsuario          = Admin.modalEditarUsuario.bind(Admin);
window.fecharModalEditarUsuario    = Admin.fecharModalEditarUsuario.bind(Admin);
window.salvarEdicaoUsuario         = Admin.salvarEdicaoUsuario.bind(Admin);

/* ==========================================================================
   INICIALIZAÇÃO (Entry Point)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Setup Tema
    const savedTheme = localStorage.getItem(CONFIG.THEME_KEY);
    if (savedTheme) document.body.setAttribute('data-theme', savedTheme);

    // 2. Verifica Sessão
    const logado = await Auth.verificarSessao();

    if (logado) {
        Config.carregarCategorias();

        // 3. Defaults de Datas e Inputs
        const hoje = new Date().toISOString().split('T')[0];
        document.querySelectorAll('input[type="date"]').forEach(inp => {
            if (!inp.value && !inp.id.startsWith('filtro-')) inp.value = hoje;
        });

        // Atalhos de Teclado
        document.addEventListener('keydown', function (event) {
            const telaNovo = document.getElementById('view-novo');
            if (telaNovo && !telaNovo.classList.contains('hidden') && telaNovo.offsetParent !== null) {
                if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
                    event.preventDefault();
                    const ordem = ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat', 'boleto-status'];
                    const idx = ordem.indexOf(event.target.id);
                    if (idx > -1 && idx < ordem.length - 1) {
                        document.getElementById(ordem[idx + 1]).focus();
                    } else if (idx === ordem.length - 1) {
                        Financeiro.salvar({ type: 'submit', preventDefault: () => {} }); // Enter no último campo → salva e limpa
                    }
                }
            }
        });
    }
});
/* ==========================================================================
   MÓDULO: MOBILE (Responsividade JavaScript)
   ========================================================================== */
const Mobile = {
    isMobile() {
        return window.innerWidth <= 640;
    },

    // Sincroniza tabs da bottom bar com a navegação
    syncTabBar(telaId) {
        const tabMap = {
            'dashboard': 0,
            'novo': 1,
            'lista': 2,
            'fluxo': 3
        };
        const tabs = document.querySelectorAll('.tab-item');
        tabs.forEach(t => t.classList.remove('active'));

        const idx = tabMap[telaId];
        if (idx !== undefined && tabs[idx]) {
            tabs[idx].classList.add('active');
        }
        // Secondary screens (logs, config) — no tab active, but keep "Menu" tab
    },

    // Inicializar FullCalendar em modo listWeek no mobile
    patchCalendarForMobile() {
        if (!this.isMobile()) return;
        // Guarda a instância numa variável de closure — sem poluir o elemento DOM
        let mobileCalendarInstance = null;
        Dashboard.renderizarCalendario = function(eventos) {
            const calendarEl = document.getElementById('calendar');
            if (!calendarEl || typeof FullCalendar === 'undefined') return;

            if (mobileCalendarInstance) {
                mobileCalendarInstance.destroy();
                mobileCalendarInstance = null;
            }

            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'listWeek',
                locale: 'pt-br',
                height: 'auto',
                events: (eventos || []).map(ev => ({
                    id: ev.id,
                    title: ev.descricao,
                    start: ev.vencimento,
                    backgroundColor: ev.status === 'Pago' ? '#10b981' : (ev.status === 'Vencido' ? '#ef4444' : '#f59e0b')
                }))
            });
            calendar.render();
            mobileCalendarInstance = calendar;
        };
    },

    // Configurar Fluxo de Caixa com tabs de formulário
    setupFluxoTabs() {
        if (!this.isMobile()) return;

        const fluxoSection = document.getElementById('view-fluxo');
        if (!fluxoSection) return;

        // Inject tab UI around the two forms if not already done
        if (fluxoSection.querySelector('.fluxo-tab-btns')) return;

        const wrapper = fluxoSection.querySelector('div[style*="display: flex"][style*="gap: 20px"]');
        if (!wrapper) return;

        const leftCol = wrapper.querySelector('div[style*="min-width: 300px"]');
        if (!leftCol) return;

        const entradaCard = leftCol.querySelectorAll('.card')[0];
        const saidaCard = leftCol.querySelectorAll('.card')[1];
        if (!entradaCard || !saidaCard) return;

        // Add tab classes
        entradaCard.classList.add('fluxo-form-panel', 'active');
        saidaCard.classList.add('fluxo-form-panel');

        // Create tab buttons
        const tabBar = document.createElement('div');
        tabBar.className = 'fluxo-tab-btns';
        tabBar.innerHTML = `
            <button class="fluxo-tab-btn active" onclick="Mobile.switchFluxoTab(0, this)">➕ Entrada</button>
            <button class="fluxo-tab-btn" onclick="Mobile.switchFluxoTab(1, this)">➖ Saída</button>
        `;

        leftCol.classList.add('fluxo-forms-wrapper');
        leftCol.insertBefore(tabBar, entradaCard);
    },

    switchFluxoTab(idx, btn) {
        const panels = document.querySelectorAll('.fluxo-form-panel');
        const btns = document.querySelectorAll('.fluxo-tab-btn');
        panels.forEach((p, i) => p.classList.toggle('active', i === idx));
        btns.forEach((b, i) => b.classList.toggle('active', i === idx));
    },

    // Setup config accordions
    setupConfigAccordions() {
        if (!this.isMobile()) return;
        const viewConfig = document.getElementById('view-config');
        if (!viewConfig || viewConfig.dataset.mobileReady) return;
        viewConfig.dataset.mobileReady = '1';

        const cards = viewConfig.querySelectorAll('.card');
        const sections = [
            { icon: '🚚', title: 'Fornecedores', open: false },
            { icon: '🎨', title: 'Aparência', open: false },
            { icon: '📂', title: 'Categorias Financeiras', open: false },
            { icon: '👥', title: 'Gestão de Equipe', open: false },
            { icon: '👤', title: 'Perfil de Acesso', open: false },
        ];

        cards.forEach((card, i) => {
            const info = sections[i] || { icon: '⚙️', title: 'Configuração', open: false };
            // Get existing h3 text
            const h3 = card.querySelector('h3');
            if (!h3) return;
            const titleText = h3.innerText || info.title;

            // Wrap content after h3 (+ first-level siblings within card)
            const cardChildren = Array.from(card.children);

            const header = document.createElement('div');
            header.className = 'config-accordion-header';
            header.innerHTML = `<span>${titleText}</span><span class="config-acc-arrow">${info.open ? '▲' : '▼'}</span>`;

            const body = document.createElement('div');
            body.className = 'config-accordion-body' + (info.open ? '' : ' collapsed');

            // Move all children to body
            cardChildren.forEach(child => body.appendChild(child));

            card.appendChild(header);
            card.appendChild(body);

            header.onclick = () => {
                const isOpen = !body.classList.contains('collapsed');
                body.classList.toggle('collapsed', isOpen);
                header.querySelector('.config-acc-arrow').textContent = isOpen ? '▼' : '▲';
            };
        });
    },

    // Sync mobile avatar with desktop
    syncUserDisplay() {
        const userDisplay = document.getElementById('user-display');
        const userRole = document.getElementById('user-role');
        const mobileDisplay = document.getElementById('mobile-user-display');
        const mobileRole = document.getElementById('mobile-user-role');
        const avatarIcon = document.getElementById('avatar-icon');
        const mobileAvatar = document.getElementById('mobile-avatar-icon');

        if (userDisplay && mobileDisplay) mobileDisplay.innerText = userDisplay.innerText;
        if (userRole && mobileRole) mobileRole.innerText = userRole.innerText;
        if (avatarIcon && mobileAvatar) mobileAvatar.innerText = avatarIcon.innerText;

        // Show/hide admin-only items in drawer
        if (State.usuario) {
            document.querySelectorAll('#mobile-menu-drawer .admin-only').forEach(el => {
                el.style.display = State.usuario.funcao === 'Admin' ? 'flex' : 'none';
            });
        }
    },

    init() {
        if (!this.isMobile()) return;
        this.patchCalendarForMobile();

        // Hide tab bar on login screen, show on app
        const tabBar = document.getElementById('mobile-tab-bar');
        if (tabBar) {
            const appScreen = document.getElementById('app-screen');
            tabBar.style.display = appScreen && !appScreen.classList.contains('hidden') ? 'flex' : 'none';
        }
    }
};

// Toggle date filter accordion
window.toggleDateFilters = function(btn) {
    const body = btn.parentElement.querySelector('.date-filter-body');
    if (!body) return;
    body.classList.toggle('hidden');
    const arrow = btn.querySelector('.date-arrow');
    if (arrow) arrow.textContent = body.classList.contains('hidden') ? '▼' : '▲';
};

// Mobile navigation wrapper
window.mobileNav = function(telaId, tabEl) {
    window.nav(telaId, null);
    Mobile.syncTabBar(telaId);
    // Close drawer if open
    closeMobileMenu();
};

// Mobile drawer controls
window.toggleMobileMenu = function() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const drawer = document.getElementById('mobile-menu-drawer');
    if (!overlay || !drawer) return;
    const isOpen = !drawer.classList.contains('hidden');
    if (isOpen) {
        closeMobileMenu();
    } else {
        overlay.classList.remove('hidden');
        drawer.classList.remove('hidden');
        Mobile.syncUserDisplay();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.closeMobileMenu = function() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const drawer = document.getElementById('mobile-menu-drawer');
    if (overlay) overlay.classList.add('hidden');
    if (drawer) drawer.classList.add('hidden');
};

// Patch UI.navegar to also sync tab bar and run mobile inits
const _origNavegar = UI.navegar.bind(UI);
UI.navegar = function(telaId, elementoBtn) {
    _origNavegar(telaId, elementoBtn);
    if (Mobile.isMobile()) {
        Mobile.syncTabBar(telaId);

        // Show/hide tab bar based on login vs app
        const tabBar = document.getElementById('mobile-tab-bar');
        const appScreen = document.getElementById('app-screen');
        if (tabBar) {
            tabBar.style.display = appScreen && !appScreen.classList.contains('hidden') ? 'flex' : 'none';
        }

        // Run screen-specific mobile inits
        if (telaId === 'fluxo') {
            setTimeout(() => Mobile.setupFluxoTabs(), 50);
        }
        if (telaId === 'config') {
            setTimeout(() => Mobile.setupConfigAccordions(), 50);
        }
    }
};
window.nav = UI.navegar;

// Patch Auth.iniciarApp to sync mobile UI after login
const _origIniciarApp = Auth.iniciarApp.bind(Auth);
Auth.iniciarApp = function(dadosUsuario) {
    _origIniciarApp(dadosUsuario);
    if (Mobile.isMobile()) {
        const tabBar = document.getElementById('mobile-tab-bar');
        if (tabBar) tabBar.style.display = 'flex';
        setTimeout(() => Mobile.syncUserDisplay(), 100);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

// Patch Auth.logout to hide tab bar
const _origLogout = Auth.logout.bind(Auth);
Auth.logout = async function() {
    await _origLogout();
    const tabBar = document.getElementById('mobile-tab-bar');
    if (tabBar) tabBar.style.display = 'none';
};
window.fazerLogoutReal = Auth.logout;

// Initialize mobile on DOMContentLoaded (append after existing listener)
document.addEventListener("DOMContentLoaded", () => {
    Mobile.init();

    // Hide tab bar initially (shown after login)
    const tabBar = document.getElementById('mobile-tab-bar');
    if (tabBar && Mobile.isMobile()) {
        const appScreen = document.getElementById('app-screen');
        tabBar.style.display = (appScreen && !appScreen.classList.contains('hidden')) ? 'flex' : 'none';
    }

    // Reinit lucide after mobile drawer renders
    if (Mobile.isMobile() && typeof lucide !== 'undefined') {
        setTimeout(() => lucide.createIcons(), 200);
    }
});

// Handle resize (tablet rotation etc.)
window.addEventListener('resize', () => {
    const tabBar = document.getElementById('mobile-tab-bar');
    if (!tabBar) return;
    if (!Mobile.isMobile()) {
        tabBar.style.display = 'none';
        closeMobileMenu();
    } else {
        const appScreen = document.getElementById('app-screen');
        if (appScreen && !appScreen.classList.contains('hidden')) {
            tabBar.style.display = 'flex';
        }
    }
});

/* Mobile module exposed globally */
window.Mobile = Mobile;

/* Ensure Financeiro.fecharModalBaixa and confirmarBaixa are properly exposed
   (already done in original, just ensuring mobile patches don't break them) */
if (!window.Financeiro) {
    // Safety alias if module reference was overridden
    window.Financeiro = window.Financeiro || {};
}