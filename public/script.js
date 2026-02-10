/* ==========================================================================
   FARMÁCIA SYSTEM - MAIN APP
   Refatorado para Modularidade e Manutenção
   ========================================================================== */

/* 1. CONFIGURAÇÕES E CONSTANTES */
const CONFIG = {
    API_URL: '/api',
    ANIMATION_SPEED: 300,
    THEME_KEY: 'theme'
};

/* 2. ESTADO GLOBAL DA APLICAÇÃO */
const State = {
    usuario: null,
    paginaAtualFinanceiro: 1,
    totalPaginasFinanceiro: 1,
    chartMes: null,
    chartCat: null,
    fornecedoresCache: [],
    buscaTimeout: null
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

        const userDisplay = document.getElementById('user-display');
        const userRole = document.getElementById('user-role');
        if (userDisplay) userDisplay.innerText = dadosUsuario.nome;
        if (userRole) userRole.innerText = dadosUsuario.funcao === 'Admin' ? 'Administrador' : 'Operador';

        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = dadosUsuario.funcao === 'Admin' ? 'block' : 'none';
        });

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
        if (!dados) return;

        // Atualiza Cards
        if (dados.cards) {
            const map = {
                'card-pagar-mes': dados.cards.pagar_mes,
                'card-pago-mes': dados.cards.pago_mes,
                'card-vencidos-val': dados.cards.vencidos_val,
                'card-proximos-val': dados.cards.proximos_val
            };
            for (const [id, val] of Object.entries(map)) {
                const el = document.getElementById(id);
                if (el) el.innerText = Utils.formatarMoedaBRL(val);
            }
            document.getElementById('card-vencidos-qtd').innerText = dados.cards.vencidos_qtd;
            document.getElementById('card-proximos-qtd').innerText = dados.cards.proximos_qtd;
        }

        Dashboard.renderizarGraficos(dados.graficos);
        Dashboard.renderizarCalendario(dados.calendario);
    },

    renderizarGraficos(dados) {
        if (!dados || typeof Chart === 'undefined') return;

        // Gráfico Evolução (Linha)
        const ctxMes = document.getElementById('chartMes');
        if (ctxMes) {
            if (State.chartMes) State.chartMes.destroy();
            State.chartMes = new Chart(ctxMes, {
                type: 'line',
                data: {
                    labels: dados.por_mes.map(d => d.mes),
                    datasets: [{
                        label: 'Total (R$)',
                        data: dados.por_mes.map(d => d.total),
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // Gráfico Categoria (Donut)
        const ctxCat = document.getElementById('chartCat');
        if (ctxCat) {
            if (State.chartCat) State.chartCat.destroy();
            State.chartCat = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels: dados.por_categoria.map(d => d.categoria),
                    datasets: [{
                        data: dados.por_categoria.map(d => d.total),
                        backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
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

    async baixar(id) {
        if (!confirm("Confirmar baixa?")) return;
        const res = await API.request(`financeiro.php?action=baixar&id=${id}`, 'POST');
        if (res && res.success) {
            UI.showToast("Baixa realizada!");
            Financeiro.carregar(State.paginaAtualFinanceiro);
        }
    },

    // Ações Auxiliares
    async lerCodigoBarras() {
        const inputCod = document.getElementById('boleto-cod');
        const codigo = inputCod.value.trim();
        if (codigo.length < 10) return;

        const res = await API.request('boleto.php', 'POST', { codigo: codigo });
        if (res && res.valido) {
            UI.showToast("Identificado!");

            // PIX
            if (res.tipo.includes('PIX')) {
                const modalQR = document.getElementById('modal-qrcode');
                const imgQR = document.getElementById('img-qrcode');
                if (modalQR && imgQR) {
                    imgQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codigo)}`;
                    modalQR.classList.remove('hidden');
                    UI.showToast("QR Code PIX Gerado.", "success");
                }
            }
            // Auto-fill
            if (res.valor > 0) document.getElementById('boleto-valor').value = Utils.formatarMoedaBRL(res.valor);
            if (res.vencimento) {
                document.getElementById('boleto-venc').value = res.vencimento;
                Financeiro.verificarVencimento();
            }
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
    }
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
    // tipo pode ser: 'entrada', 'saida', 'todos'

    const tbody = document.querySelector('#tabela-fluxo tbody');
    const linhas = tbody.querySelectorAll('tr');

    if (linhas.length === 0 || (linhas.length === 1 && linhas[0].innerText.includes('Nenhuma movimentação'))) {
        return;
    }

    linhas.forEach(tr => {
        // Verifica as classes que o seu script.js adiciona na coluna de valor
        // Entradas têm a classe 'text-success', Saídas têm 'text-danger'
        const isEntrada = tr.innerHTML.includes('text-success');
        const isSaida = tr.innerHTML.includes('text-danger');

        if (tipo === 'todos') {
            tr.style.display = ''; // Mostra tudo
        }
        else if (tipo === 'entrada') {
            tr.style.display = isEntrada ? '' : 'none';
        }
        else if (tipo === 'saida') {
            tr.style.display = isSaida ? '' : 'none';
        }
    });

    // Feedback visual opcional (Toast rápido)
    const mapaNomes = { 'entrada': 'Entradas', 'saida': 'Saídas', 'todos': 'Tudo' };
    // showToast(`Filtrando por: ${mapaNomes[tipo]}`, 'info');
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

        Config.renderizarFornecedores();

        if (State.usuario) {
            const iLogin = document.getElementById('conf-login');
            const iNome = document.getElementById('conf-nome');
            if (iLogin) iLogin.value = State.usuario.usuario || State.usuario.login || '';
            if (iNome) iNome.value = State.usuario.nome || '';
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
        if (!State.fornecedoresCache.length) {
            Config.carregarFornecedores().then(() => Config.renderizarFornecedores()); // Tenta carregar se estiver vazio
            return;
        }

        State.fornecedoresCache.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${f.nome}</td><td>${f.cnpj || '-'}</td><td>${f.telefone || '-'}</td>
                            <td class="text-right"><button class="btn-icon btn-trash" onclick="Config.excluirFornecedor(${f.id})">🗑</button></td>`;
            tbody.appendChild(tr);
        });
    },

    async salvarFornecedor() {
        // Referências aos elementos para capturar valores e limpar posteriormente
        const elNome = document.getElementById('novo-forn-nome');
        const elCnpj = document.getElementById('novo-forn-cnpj');
        const elTel = document.getElementById('novo-forn-tel');
        const elCat = document.getElementById('novo-forn-cat');

        const dados = {
            nome: elNome.value,
            cnpj: elCnpj.value,
            telefone: elTel.value,
            categoriaPadrao: elCat.value
        };

        const res = await API.request('fornecedores.php', 'POST', dados);
        
        if (res?.success) {
            // Feedback visual elegante
            UI.showToast("Cadastrado!", "success");
            
            // Limpa os campos para permitir novo registro imediato
            elNome.value = '';
            elCnpj.value = '';
            elTel.value = '';
            elCat.value = ''; // Reseta a seleção de categoria

            // Atualiza a lista e o cache
            Config.carregarFornecedores().then(() => Config.renderizarFornecedores());
        } else {
            // Tratamento de erro robusto (suporta 'message' ou 'error' vindo da API)
            const mensagem = res?.message || res?.error || 'Desconhecido';
            UI.showToast("Erro: " + mensagem, "error");
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
                
                // Verifica se é o próprio usuário logado (impede auto-exclusão)
                // Nota: == é usado propositalmente para comparar string "1" com number 1 se necessário
                const isSelf = (State.usuario && u.id == State.usuario.id);
                
                // Renderização condicional do botão
                const deleteBtn = isSelf 
                    ? `<span class="btn-icon" style="opacity: 0.3; cursor: not-allowed;" title="Você não pode se excluir">🚫</span>` 
                    : `<button class="btn-icon btn-trash" onclick="Admin.excluirUsuario(${u.id})" title="Excluir">🗑</button>`;

                tr.innerHTML = `
                    <td>${u.nome}</td>
                    <td>${u.login}</td>
                    <td><span class="status-badge">${u.funcao}</span></td>
                    <td class="text-right">
                        <button class="btn-icon" onclick="Admin.modalReset(${u.id}, '${u.nome}')" title="Alterar Senha">🔑</button>
                        ${deleteBtn}
                    </td>`;
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
    // 1. Captura os elementos do DOM
    const nomeInput = document.getElementById('novo-user-nome');
    const loginInput = document.getElementById('novo-user-login');
    const senhaInput = document.getElementById('novo-user-senha');
    const funcaoInput = document.getElementById('novo-user-funcao');

    // 2. Validação Básica
    if (!nomeInput.value || !loginInput.value || !senhaInput.value) {
        return UI.showToast("Preencha nome, login e senha.", "error"); // CORRIGIDO: UI.showToast
    }

    const payload = {
        nome: nomeInput.value,
        login: loginInput.value,
        password: senhaInput.value,
        nivel: funcaoInput.value
    };

    // 3. Feedback visual no botão
    const btn = document.querySelector('button[onclick="criarNovoUsuario()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    // 4. Envia para a API (CORRIGIDO: API.request)
    const res = await API.request('admin.php?action=criarUsuario', 'POST', payload);

    btn.innerText = textoOriginal;
    btn.disabled = false;

    // 5. Tratamento da Resposta
    if (res && res.success) {
        UI.showToast("Usuário cadastrado com sucesso!"); // CORRIGIDO: UI.showToast

        // Limpa os campos
        nomeInput.value = '';
        loginInput.value = '';
        senhaInput.value = '';
        funcaoInput.value = 'Operador';

        // Recarrega a lista de usuários (CORRIGIDO: Admin.carregarUsuarios)
        Admin.carregarUsuarios();
    } else {
        UI.showToast(res?.message || "Erro ao criar usuário.", "error"); // CORRIGIDO: UI.showToast
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
window.filtrarDashboard = Dashboard.carregar;
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
                        Financeiro.salvar(event.ctrlKey); // Simula comportamento do botão Salvar+Novo
                    }
                }
            }
        });
    }
});