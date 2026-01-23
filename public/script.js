/* ==========================================================================
   1. CONSTANTES & VARIÁVEIS GLOBAIS
   ========================================================================== */
   const LOADER_HTML = `
   <tr class="loading-row">
       <td colspan="100%" style="text-align:center; padding: 40px;">
           <div class="loader-container"><div class="loader"></div></div>
       </td>
   </tr>
`;

const CATEGORIAS_PADRAO = [
   "Medicamentos (Estoque)", "Materiais de Consumo", "Impostos & Taxas",
   "Folha de Pagamento", "Aluguel & Condomínio", "Água/Luz/Internet",
   "Marketing", "Manutenção", "Outros"
];

let chartM = null;
let chartC = null;
let paginaAtual = 1;
let totalPaginas = 1;
let debounceTimer;
let listaFornecedoresCache = [];

/* ==========================================================================
  2. UTILITÁRIOS (CORE)
  ========================================================================== */
function getCookie(name) {
   if (!document.cookie) return null;
   const xsrfCookies = document.cookie.split(';').map(c => c.trim()).filter(c => c.startsWith(name + '='));
   if (xsrfCookies.length === 0) return null;
   return decodeURIComponent(xsrfCookies[0].split('=')[1]);
}

async function request(url, method = 'GET', body = null, silent = false) {
   const headers = { 'Content-Type': 'application/json' };

   if (method !== 'GET') {
       const csrfToken = getCookie('XSRF-TOKEN');
       if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken;
   }

   const options = { method, headers };
   if (body) options.body = JSON.stringify(body);

   try {
       const response = await fetch(url, options);

       if (response.status === 401 || response.status === 403) {

           // --- ADICIONE ESTAS 3 LINHAS AQUI ---
           // Se o erro acontecer na tentativa de login, retorna para mostrar "Senha Inválida"
           if (url.includes('/api/login')) {
               return response;
           }
           // ------------------------------------

           if (silent) throw new Error("Sessão inválida (silencioso)");

           console.warn(`Erro de Segurança: Status ${response.status}`);

           // Evita loop se já estiver no login
           const loginScreen = document.getElementById('login-screen');
           if (loginScreen && !loginScreen.classList.contains('hidden') && !url.includes('/api/login')) {
               throw new Error("Acesso negado");
           }

           showToast("Sessão expirada. Faça login novamente.", "error");

           setTimeout(() => {
               document.getElementById('app-screen')?.classList.add('hidden');
               document.getElementById('login-screen')?.classList.remove('hidden');
               const passInput = document.getElementById('login-pass');
               if(passInput) passInput.value = '';
           }, 1500);
           throw new Error("Acesso negado");
       }

       return response;
   } catch (error) {
       if (error.message !== "Acesso negado" && error.message !== "Sessão inválida (silencioso)") {
           console.error("Erro na requisição:", error);
       }
       throw error;
   }
}

function showToast(msg, type = 'success') {
   const container = document.getElementById('toast-container');
   if (container) {
       const toast = document.createElement('div');
       toast.className = `toast ${type}`;
       const icone = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⚠️');
       toast.innerHTML = `<span>${icone}</span> <span>${msg}</span>`;
       container.appendChild(toast);

       // Animação de entrada e saída
       setTimeout(() => {
           toast.style.opacity = '0';
           setTimeout(() => toast.remove(), 500);
       }, 3500);
   }
}

function mascaraMoeda(input) {
   let v = input.value.replace(/\D/g, '');
   v = (v / 100).toFixed(2) + '';
   input.value = "R$ " + v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

function formatarValorParaBanco(valorString) {
   if (!valorString) return 0.0;
   return parseFloat(valorString.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
}

/* ==========================================================================
  3. AUTH & SESSÃO
  ========================================================================== */
async function verificarSessao() {
   try {
       const res = await request('/api/dados_usuario', 'GET', null, true);
       if (res.ok) {
           const data = await res.json();
           if (data.login) {
               iniciarAplicacao(data);
           }
       }
   } catch (e) {
       console.log("Aguardando login do usuário.");
   }
}

async function fazerLogin() {
   const userEl = document.getElementById('login-user');
   const passEl = document.getElementById('login-pass');
   const btn = document.getElementById('btn-entrar');

   if (!userEl || !passEl) return;

   btn.disabled = true;
   const textoOriginal = btn.innerHTML;
   btn.innerHTML = '<div class="loader" style="width:20px;height:20px;border-width:2px;"></div> Verificando...';

   try {
       const res = await request('/api/login', 'POST', { usuario: userEl.value, senha: passEl.value });
       const data = await res.json();

       if (data.success) {
           btn.innerHTML = '✓ Sucesso!';
           showToast(`Bem-vindo, ${data.nome}!`, "success");
           setTimeout(() => iniciarAplicacao(data), 500);
       } else {
           throw new Error(data.message || "Credenciais inválidas");
       }
   } catch (err) {
       btn.disabled = false;
       btn.innerHTML = textoOriginal;
       if (err.message !== "Acesso negado") {
           showToast("Usuário ou senha inválidos.", "error");
       }
   }
}

function iniciarAplicacao(userData) {
   document.getElementById('user-display').innerText = userData.nome;
   sessionStorage.setItem('user_role', userData.funcao);

   document.getElementById('login-screen').classList.add('hidden');
   document.getElementById('app-screen').classList.remove('hidden');

   // Carrega dados essenciais
   carregarFornecedores();

   // Navegação inicial
   const hash = window.location.hash.replace('#', '') || 'dashboard';
   nav(hash, null, false);
}

async function fazerLogout() {
   try { await request('/api/logout', 'POST'); } catch (e) { console.error(e); }
   window.location.reload();
}

function toggleSenha() {
   const campo = document.getElementById('login-pass');
   if(campo) campo.type = campo.type === "password" ? "text" : "password";
}

function confirmarLogout() { document.getElementById('modal-logout')?.classList.remove('hidden'); }
function fecharModalLogout() { document.getElementById('modal-logout')?.classList.add('hidden'); }

/* ==========================================================================
  4. NAVEGAÇÃO (SPA)
  ========================================================================== */
function nav(viewId, elementoMenu, addToHistory = true) {
   // Esconde todas as views
   document.querySelectorAll('.content > div').forEach(el => {
       if (!el.id.startsWith('modal')) el.classList.add('hidden');
   });

   const view = document.getElementById('view-' + viewId);
   if (view) {
       view.classList.remove('hidden');
   } else {
       // Fallback para dashboard se a view não existir
       nav('dashboard', null, false);
       return;
   }

   // Atualiza Menu Ativo
   document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
   if (elementoMenu) {
       elementoMenu.classList.add('active');
   } else {
       // Tenta encontrar o botão do menu correspondente pelo onclick
       const menuAuto = document.querySelector(`.menu-item[onclick*="'${viewId}'"]`);
       if (menuAuto) menuAuto.classList.add('active');
   }

   if (addToHistory) history.pushState({ view: viewId }, '', `#${viewId}`);

   // Fecha sidebar mobile se aberta
   const sidebar = document.getElementById('sidebar');
   if (window.innerWidth <= 1024 && sidebar?.classList.contains('active')) toggleSidebar();

   // Lógica específica de cada tela (Lazy Loading)
   verificarPermissoesUI();

   switch (viewId) {
       case 'dashboard':
           carregarDashboard();
           break;
       case 'lista':
           carregarLista(1);
           break;
       case 'logs':
           carregarLogs();
           break;
       case 'config':
           carregarConfiguracoes();
           break;
       case 'fluxo':
           prepararFiltroFluxo();
           carregarFluxo();
           break;
       case 'novo':
           setTimeout(() => document.getElementById('boleto-cod')?.focus(), 100);
           break;
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

   if (roleEl) roleEl.innerText = role === 'Admin' ? "Administrador" : "Operador";

   adminItems.forEach(el => {
       if (role === 'Admin') el.classList.remove('hidden');
       else el.classList.add('hidden');
   });
}

function toggleSidebar() {
   const sidebar = document.getElementById('sidebar');
   const overlay = document.getElementById('mobile-overlay');
   if(sidebar) sidebar.classList.toggle('active');
   if(overlay && sidebar) overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
}

/* ==========================================================================
  5. DASHBOARD
  ========================================================================== */
async function carregarDashboard(periodo = null) {
   if (!periodo) periodo = localStorage.getItem('dashboard_periodo') || '7d';
   localStorage.setItem('dashboard_periodo', periodo);

   // Atualiza botões de filtro visualmente
   document.querySelectorAll('.filter-btn').forEach(b => {
       b.classList.remove('active');
       if (b.getAttribute('onclick')?.includes(`'${periodo}'`)) b.classList.add('active');
   });

   try {
       const res = await request(`/api/dashboard?periodo=${periodo}`);
       const data = await res.json();

       // Atualiza Cards
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

       // Gráficos
       const containerCharts = document.getElementById('charts-container');
       const containerEmpty = document.getElementById('dashboard-empty-state');
       const temDados = data.graficos && data.graficos.por_mes && data.graficos.por_mes.length > 0;

       if (!temDados) {
           if (containerCharts) containerCharts.classList.add('hidden');
           if (containerEmpty) containerEmpty.classList.remove('hidden');
       } else {
           if (containerCharts) { containerCharts.classList.remove('hidden'); containerCharts.style.opacity = '1'; }
           if (containerEmpty) containerEmpty.classList.add('hidden');
           renderCharts(data.graficos);
       }
   } catch (e) {
       console.error("Erro dashboard", e);
   }
}

function renderCharts(graficos) {
   // Gráfico de Linha (Evolução Mensal)
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
               plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
               scales: {
                   y: { beginAtZero: true, grid: { borderDash: [5, 5], color: '#e2e8f0' } },
                   x: { grid: { display: false } }
               }
           }
       });
   }

   // Gráfico de Rosca (Categorias)
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
                   backgroundColor: ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'],
                   borderWidth: 0
               }]
           },
           options: {
               responsive: true,
               maintainAspectRatio: false,
               plugins: { legend: { position: 'right', labels: { usePointStyle: true } } },
               cutout: '75%'
           }
       });
   }
}

/* ==========================================================================
  6. BOLETOS & LANÇAMENTOS (CRUD)
  ========================================================================== */
function validarFormulario() {
   const getVal = (id) => document.getElementById(id)?.value;
   return getVal('boleto-desc') && getVal('boleto-valor') && getVal('boleto-venc');
}

function limparFormulario() {
   ['boleto-cod', 'boleto-desc', 'boleto-valor', 'boleto-venc', 'boleto-cat'].forEach(id => {
       const el = document.getElementById(id);
       if(el) el.value = '';
   });
   const statusEl = document.getElementById('boleto-status');
   if(statusEl) statusEl.value = 'Pendente';

   document.getElementById('aviso-vencido').style.display = 'none';
}

async function salvarBoleto(manterNaTela = true) {
   if (!validarFormulario()) return showToast("Preencha a descrição, valor e vencimento.", "error");

   const dados = {
       codigo: document.getElementById('boleto-cod').value,
       descricao: document.getElementById('boleto-desc').value,
       valor: formatarValorParaBanco(document.getElementById('boleto-valor').value),
       vencimento: document.getElementById('boleto-venc').value,
       categoria: document.getElementById('boleto-cat').value,
       status: document.getElementById('boleto-status').value
   };

   // Se tiver ID oculto, é edição
   const idEdicao = document.getElementById('boleto-id-hidden')?.value;
   const url = idEdicao ? `/api/registros/${idEdicao}` : '/api/novo_boleto';
   const method = idEdicao ? 'PUT' : 'POST';

   try {
       const r = await request(url, method, dados);
       const resposta = await r.json();

       if (resposta.success) {
           showToast("Salvo com sucesso!", "success");
           limparFormulario();
           // Remove ID hidden se existia
           const hiddenId = document.getElementById('boleto-id-hidden');
           if(hiddenId) hiddenId.value = '';

           if (manterNaTela) {
               document.getElementById('boleto-cod').focus();
           } else {
               nav('lista');
           }
       } else {
           showToast(resposta.message || "Erro ao salvar", "error");
       }
   } catch (e) {
       showToast("Erro de comunicação.", "error");
   }
}

async function lerCodigoBarras() {
   const inputCodigo = document.getElementById('boleto-cod');
   if(!inputCodigo.value) return showToast("Digite o código de barras.", "warning");

   inputCodigo.style.opacity = "0.5";
   try {
       const r = await request('/api/ler_codigo', 'POST', { codigo: inputCodigo.value });
       const d = await r.json();

       inputCodigo.style.opacity = "1";

       if (d.valor) {
           const elValor = document.getElementById('boleto-valor');
           elValor.value = `R$ ${d.valor.toFixed(2).replace('.', ',')}`;
           mascaraMoeda(elValor);
       }
       if (d.vencimento) {
           document.getElementById('boleto-venc').value = d.vencimento;
           verificarVencimento();
       }
       showToast("Código lido!", "success");
   } catch (e) {
       inputCodigo.style.opacity = "1";
       showToast("Não foi possível ler o código.", "error");
   }
}

function verificarVencimento() {
   const dataVenc = document.getElementById('boleto-venc').value;
   const aviso = document.getElementById('aviso-vencido');
   if (dataVenc && aviso) {
       // Compara datas sem hora
       const dtVenc = new Date(dataVenc + 'T00:00:00');
       const hoje = new Date();
       hoje.setHours(0,0,0,0);

       aviso.style.display = (dtVenc < hoje) ? 'block' : 'none';
   }
}

/* ==========================================================================
  7. LISTAGEM DE REGISTROS (Tabela Principal)
  ========================================================================== */
async function carregarLista(pagina = 1) {
   paginaAtual = pagina;
   const tbody = document.querySelector('#tabela-registros tbody');
   if (!tbody) return;

   tbody.innerHTML = LOADER_HTML;

   const busca = document.getElementById('filtro-busca')?.value || '';
   const status = document.getElementById('filtro-status')?.value || '';
   const categoria = document.getElementById('filtro-cat')?.value || 'Todas';

   try {
       const url = `/api/registros?pagina=${pagina}&busca=${encodeURIComponent(busca)}&status=${status}&categoria=${encodeURIComponent(categoria)}`;
       const r = await request(url);
       const d = await r.json();

       totalPaginas = d.total_paginas;
       const infoPag = document.getElementById('info-paginas');
       if(infoPag) infoPag.innerText = `Pág ${d.pagina_atual} de ${d.total_paginas}`;

       tbody.innerHTML = '';

       if (!d.registros || d.registros.length === 0) {
           tbody.innerHTML = '<tr><td colspan="6" align="center" style="padding:20px; color:#64748b">Nenhum registro encontrado.</td></tr>';
           return;
       }

       d.registros.forEach(item => {
           const tr = document.createElement('tr');

           // Formatação de cor para status
           let statusClass = 'status-pendente';
           if(item.status === 'Pago') statusClass = 'status-pago';
           if(item.status === 'Vencido') statusClass = 'status-vencido';

           const valorFmt = parseFloat(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

           tr.innerHTML = `
               <td>${formatarDataBrasileira(item.vencimento)}</td>
               <td style="font-weight:500">${item.descricao}</td>
               <td><span class="tag-categoria">${item.categoria}</span></td>
               <td>${valorFmt}</td>
               <td><span class="badge ${statusClass}">${item.status}</span></td>
               <td class="actions-cell">
                   ${item.status !== 'Pago' ?
                       `<button onclick="baixarRegistro(${item.id})" title="Dar Baixa" class="btn-icon btn-check">✓</button>` :
                       `<button class="btn-icon disabled" disabled>✓</button>`
                   }
                   <button onclick="carregarParaEdicao(${item.id})" title="Editar" class="btn-icon btn-edit">✎</button>
                   <button onclick="excluirRegistro(${item.id})" title="Excluir" class="btn-icon btn-del">🗑</button>
               </td>
           `;
           tbody.appendChild(tr);
       });
   } catch (e) {
       console.error(e);
       tbody.innerHTML = '<tr><td colspan="6" align="center" style="color:#ef4444">Erro ao carregar dados.</td></tr>';
   }
}

// Ações da Tabela
async function baixarRegistro(id) {
   if(!confirm("Confirmar pagamento deste registro?")) return;
   try {
       const r = await request(`/api/registros/${id}/baixar`, 'POST');
       const d = await r.json();
       if(d.success) { showToast("Baixa realizada!", "success"); carregarLista(paginaAtual); }
   } catch(e) { showToast("Erro ao dar baixa", "error"); }
}

async function excluirRegistro(id) {
   if(!confirm("Tem certeza que deseja excluir?")) return;
   try {
       const r = await request(`/api/registros/${id}`, 'DELETE');
       const d = await r.json();
       if(d.success) { showToast("Excluído!", "success"); carregarLista(paginaAtual); }
   } catch(e) { showToast("Erro ao excluir", "error"); }
}

async function carregarParaEdicao(id) {
   // Busca os dados completos do registro
   try {
       const r = await request(`/api/registros/${id}`);
       const item = await r.json();

       // Vai para tela de edição (view 'novo' reaproveitada)
       nav('novo');

       // Preenche campos
       document.getElementById('boleto-cod').value = item.codigo_barras || '';
       document.getElementById('boleto-desc').value = item.descricao;

       const elValor = document.getElementById('boleto-valor');
       elValor.value = item.valor.toFixed(2).replace('.', ''); // Ajuste para mascara
       mascaraMoeda(elValor); // Reaplica mascara

       document.getElementById('boleto-venc').value = item.vencimento;
       document.getElementById('boleto-cat').value = item.categoria;
       document.getElementById('boleto-status').value = item.status;

       // Insere ID oculto para saber que é update
       let hiddenInput = document.getElementById('boleto-id-hidden');
       if(!hiddenInput) {
           hiddenInput = document.createElement('input');
           hiddenInput.type = 'hidden';
           hiddenInput.id = 'boleto-id-hidden';
           document.getElementById('form-boleto').appendChild(hiddenInput);
       }
       hiddenInput.value = id;

       showToast("Modo de edição ativado", "info");

   } catch(e) { showToast("Erro ao carregar registro", "error"); }
}

function mudarPagina(delta) {
   const novaPagina = paginaAtual + delta;
   if (novaPagina > 0 && novaPagina <= totalPaginas) {
       carregarLista(novaPagina);
   }
}

function formatarDataBrasileira(dataYMD) {
   if(!dataYMD) return '-';
   const [ano, mes, dia] = dataYMD.split('-');
   return `${dia}/${mes}/${ano}`;
}

/* ==========================================================================
  8. FLUXO DE CAIXA (Entradas e Saídas Diárias)
  ========================================================================== */
function prepararFiltroFluxo() {
   const inputMes = document.getElementById('filtro-mes-fluxo');
   if (inputMes && !inputMes.value) {
       const hoje = new Date();
       inputMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
   }
}

async function carregarFluxo() {
   const tbody = document.querySelector('#tabela-fluxo tbody');
   if(!tbody) return;

   tbody.innerHTML = LOADER_HTML;
   const mesAno = document.getElementById('filtro-mes-fluxo').value; // YYYY-MM

   try {
       const r = await request(`/api/fluxo?mes=${mesAno}`);
       const d = await r.json();

       tbody.innerHTML = '';

       // Atualiza totais no header do fluxo se existirem elementos
       if(document.getElementById('total-entradas')) document.getElementById('total-entradas').innerText = `+ ${d.total_entradas_fmt}`;
       if(document.getElementById('total-saidas')) document.getElementById('total-saidas').innerText = `- ${d.total_saidas_fmt}`;
       if(document.getElementById('total-saldo')) document.getElementById('total-saldo').innerText = `= ${d.saldo_fmt}`;

       if(!d.movimentacoes || d.movimentacoes.length === 0) {
           tbody.innerHTML = '<tr><td colspan="4" align="center">Sem movimentações neste mês.</td></tr>';
           return;
       }

       d.movimentacoes.forEach(mov => {
           const tr = document.createElement('tr');
           const corValor = mov.tipo === 'ENTRADA' ? 'color: var(--success-color)' : 'color: var(--danger-color)';
           const sinal = mov.tipo === 'ENTRADA' ? '+' : '-';

           tr.innerHTML = `
               <td>${formatarDataBrasileira(mov.data)}</td>
               <td>${mov.descricao}</td>
               <td>${mov.categoria}</td>
               <td style="font-weight:bold; ${corValor}">${sinal} ${mov.valor_fmt}</td>
           `;
           tbody.appendChild(tr);
       });
   } catch(e) {
       tbody.innerHTML = '<tr><td colspan="4" align="center">Erro ao carregar fluxo.</td></tr>';
   }
}

async function salvarMovimentoRapido(tipo) {
   // tipo: 'entrada' ou 'saida'
   const prefixo = tipo === 'entrada' ? 'ent' : 'sai';
   const desc = document.getElementById(`${prefixo}-desc`).value;
   const valorStr = document.getElementById(`${prefixo}-valor`).value;
   const data = document.getElementById(`${prefixo}-data`).value;

   if(!desc || !valorStr || !data) return showToast("Preencha todos os campos", "error");

   try {
       const body = {
           descricao: desc,
           valor: formatarValorParaBanco(valorStr),
           data: data,
           tipo: tipo.toUpperCase()
       };

       const r = await request('/api/fluxo/movimento', 'POST', body);
       const res = await r.json();

       if(res.success) {
           showToast("Movimentação registrada!", "success");
           // Limpar campos
           document.getElementById(`${prefixo}-desc`).value = '';
           document.getElementById(`${prefixo}-valor`).value = '';
           carregarFluxo(); // Recarrega tabela
       }
   } catch(e) { showToast("Erro ao salvar", "error"); }
}

/* ==========================================================================
  9. FORNECEDORES
  ========================================================================== */
async function carregarFornecedores() {
   try {
       const res = await request('/api/fornecedores');
       listaFornecedoresCache = await res.json();

       const datalist = document.getElementById('lista-fornecedores');
       if (datalist) {
           datalist.innerHTML = '';
           listaFornecedoresCache.forEach(f => {
               const opt = document.createElement('option');
               opt.value = f.nome;
               if (f.categoria_padrao) opt.label = f.categoria_padrao;
               datalist.appendChild(opt);
           });
       }
       // Se estiver na tela de config, atualiza a tabela também
       if(!document.getElementById('view-config').classList.contains('hidden')) {
           renderizarTabelaFornecedores();
       }
   } catch (e) {
       console.error("Erro fornecedores", e);
   }
}

function renderizarTabelaFornecedores() {
   const tbody = document.getElementById('tbody-fornecedores');
   if(!tbody) return;

   tbody.innerHTML = '';
   listaFornecedoresCache.forEach(f => {
       const tr = document.createElement('tr');
       tr.innerHTML = `
           <td>${f.nome}</td>
           <td>${f.cnpj || '-'}</td>
           <td>${f.telefone || '-'}</td>
           <td style="text-align:right">
               <button onclick="excluirFornecedor(${f.id})" class="btn-icon btn-del">🗑</button>
           </td>
       `;
       tbody.appendChild(tr);
   });
}

async function salvarNovoFornecedor() {
   const nome = document.getElementById('novo-forn-nome')?.value;
   const cnpj = document.getElementById('novo-forn-cnpj')?.value;
   const tel = document.getElementById('novo-forn-tel')?.value;
   const cat = document.getElementById('novo-forn-cat')?.value;

   if(!nome) return showToast("Nome é obrigatório", "error");

   try {
       const r = await request('/api/fornecedores', 'POST', { nome, cnpj, telefone: tel, categoria_padrao: cat });
       if((await r.json()).success) {
           showToast("Fornecedor cadastrado!", "success");
           document.getElementById('novo-forn-nome').value = '';
           carregarFornecedores(); // Atualiza lista e cache
       }
   } catch(e) { showToast("Erro ao salvar fornecedor", "error"); }
}

async function excluirFornecedor(id) {
   if(!confirm("Remover este fornecedor?")) return;
   try {
       await request(`/api/fornecedores/${id}`, 'DELETE');
       carregarFornecedores();
       showToast("Removido.", "success");
   } catch(e) { showToast("Erro ao remover", "error"); }
}

/* ==========================================================================
  10. CONFIGURAÇÕES & ADMINISTRAÇÃO
  ========================================================================== */
function obterCategorias() {
   return JSON.parse(localStorage.getItem('categorias_custom')) || [...CATEGORIAS_PADRAO];
}

function salvarCategorias(lista) {
   localStorage.setItem('categorias_custom', JSON.stringify(lista));
   carregarCategoriasNosSelects();
   renderizarCategoriasConfig();
   showToast("Categorias atualizadas!", "success");
}

function adicionarCategoriaPersonalizada() {
   const input = document.getElementById('nova-cat-nome');
   const val = input.value.trim();
   if(val) {
       const lista = obterCategorias();
       if(!lista.includes(val)) {
           lista.push(val);
           salvarCategorias(lista);
           input.value = '';
       } else {
           showToast("Categoria já existe", "warning");
       }
   }
}

function removerCategoria(nome) {
   if(confirm(`Remover categoria "${nome}"?`)) {
       salvarCategorias(obterCategorias().filter(c => c !== nome));
   }
}

function resetarCategorias() {
   if(confirm("Restaurar categorias padrão?")) {
       localStorage.removeItem('categorias_custom');
       carregarCategoriasNosSelects();
       renderizarCategoriasConfig();
   }
}

function renderizarCategoriasConfig() {
   const div = document.getElementById('lista-categorias-config');
   if(div) {
       div.innerHTML = '';
       obterCategorias().forEach(c => {
           const isPadrao = CATEGORIAS_PADRAO.includes(c);
           const tag = document.createElement('div');
           tag.className = 'filter-tag';
           tag.innerHTML = `<span>${c}</span>${isPadrao ? '' : ` <span onclick="removerCategoria('${c}')" style="cursor:pointer;color:red;margin-left:5px;font-weight:bold">×</span>`}`;
           div.appendChild(tag);
       });
   }
}

function carregarCategoriasNosSelects() {
   const lista = obterCategorias();
   const selects = ['boleto-cat', 'filtro-cat', 'edit-cat', 'novo-forn-cat'];

   selects.forEach(id => {
       const el = document.getElementById(id);
       if(el) {
           const valorAtual = el.value;
           const options = lista.map(c => `<option value="${c}">${c}</option>`).join('');

           if(id === 'filtro-cat') {
               el.innerHTML = '<option value="Todas">Todas as Categorias</option>' + options;
           } else {
               el.innerHTML = '<option value="" disabled selected>Selecione...</option>' + options;
           }

           if(valorAtual && lista.includes(valorAtual)) el.value = valorAtual;
       }
   });
}

function toggleDarkMode() {
   const body = document.body;
   const isDark = body.getAttribute('data-theme') === 'dark';
   const novoTema = isDark ? 'light' : 'dark';

   body.setAttribute('data-theme', novoTema);
   localStorage.setItem('theme', novoTema);

   const btnText = document.getElementById('text-theme');
   if(btnText) btnText.innerText = novoTema === 'dark' ? 'Modo Claro' : 'Modo Escuro';
}

/* ==========================================================================
  11. LOGS DO SISTEMA
  ========================================================================== */
async function carregarLogs() {
   const tbody = document.querySelector('#tabela-logs tbody');
   if(!tbody) return;
   tbody.innerHTML = LOADER_HTML;

   try {
       const r = await request('/api/logs');
       const logs = await r.json();

       tbody.innerHTML = '';
       if(!logs.length) { tbody.innerHTML = '<tr><td colspan="3">Sem logs.</td></tr>'; return; }

       logs.forEach(l => {
           const row = document.createElement('tr');
           row.innerHTML = `
               <td style="font-size:0.85em">${l.data_hora}</td>
               <td>${l.usuario}</td>
               <td>${l.acao}</td>
           `;
           tbody.appendChild(row);
       });
   } catch(e) { tbody.innerHTML = '<tr><td colspan="3">Erro logs</td></tr>'; }
}

function carregarConfiguracoes() {
    renderizarCategoriasConfig();
    carregarFornecedores(); // Para preencher a tabela de fornecedores na aba config

    // Se for admin, carrega lista de usuários (stub)
    if(sessionStorage.getItem('user_role') === 'Admin') {
        carregarListaUsuarios();
    }
}

async function carregarListaUsuarios() {
    // Implementação básica para listar usuários do sistema (Admin)
    const tbody = document.querySelector('#tabela-usuarios tbody');
    if(!tbody) return;

    try {
        const r = await request('/api/usuarios');
        const usuarios = await r.json();
        tbody.innerHTML = '';
        usuarios.forEach(u => {
             const tr = document.createElement('tr');
             tr.innerHTML = `<td>${u.nome}</td><td>${u.login}</td><td>${u.funcao}</td>`;
             tbody.appendChild(tr);
        });
    } catch(e) { /* Silencioso se não tiver endpoint ainda */ }
}

/* ==========================================================================
  12. INICIALIZAÇÃO & EVENTOS GERAIS
  ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
   // 1. Tema
   const temaSalvo = localStorage.getItem('theme');
   if(temaSalvo) {
       document.body.setAttribute('data-theme', temaSalvo);
       const btnText = document.getElementById('text-theme');
       if(btnText) btnText.innerText = temaSalvo === 'dark' ? 'Modo Claro' : 'Modo Escuro';
   }

   // 2. Setup Inicial
   carregarCategoriasNosSelects();

   // Datas padrão em campos de data
   const hoje = new Date().toISOString().split('T')[0];
   ['ent-data', 'sai-data', 'novo-forn-data'].forEach(id => {
       const el = document.getElementById(id);
       if(el) el.value = hoje;
   });

   // 3. Verifica Sessão
   verificarSessao();

   // 4. Eventos Globais de Teclado
   document.addEventListener('keydown', e => {
       // Atalho para salvar formulário (Ctrl+Enter)
       if(e.ctrlKey && e.key === 'Enter') {
           if(!document.getElementById('view-novo')?.classList.contains('hidden')) salvarBoleto();
       }
       // Atalho para fechar formulário (Esc)
       if(e.key === 'Escape') {
           if(!document.getElementById('view-novo')?.classList.contains('hidden')) {
               nav('lista');
               limparFormulario();
           }
       }
   });

   // Login no Enter
   const checkLoginEnter = (e) => { if (e.key === 'Enter') fazerLogin(); };
   document.getElementById('login-user')?.addEventListener('keydown', checkLoginEnter);
   document.getElementById('login-pass')?.addEventListener('keydown', checkLoginEnter);
});