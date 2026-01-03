import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import math
from streamlit_calendar import calendar
import database_manager as db

# CONFIGURAÇÕES DA PÁGINA
st.set_page_config(page_title="Financeiro Farmácia", layout="wide", page_icon="🏥")
db.init_db()

# --- ESTILOS CSS ---
st.markdown("""
<style>
    .stLogin { max-width: 400px; margin: 0 auto; padding-top: 100px; }
    .sucesso-login { padding: 1rem; background-color: #d4edda; color: #155724; border-radius: 5px; margin-bottom: 1rem; }
</style>
""", unsafe_allow_html=True)

CATEGORIAS = ["Medicamentos (Estoque)", "Materiais de Consumo", "Impostos & Taxas",
              "Folha de Pagamento", "Aluguel & Condomínio", "Água/Luz/Internet",
              "Marketing", "Manutenção", "Outros"]

# --- CONTROLE DE SESSÃO (LOGIN) ---
if 'logado' not in st.session_state:
    st.session_state['logado'] = False
    st.session_state['usuario_nome'] = ""


def realizar_login():
    user = st.session_state.form_user
    senha = st.session_state.form_senha
    dados_usuario = db.verificar_login(user, senha)

    if dados_usuario:
        st.session_state['logado'] = True
        st.session_state['usuario_nome'] = dados_usuario[1]  # Nome real
        st.rerun()
    else:
        st.error("Usuário ou senha incorretos.")


def realizar_logout():
    st.session_state['logado'] = False
    st.session_state['usuario_nome'] = ""
    st.rerun()


# --- TELA DE LOGIN ---
if not st.session_state['logado']:
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.title("🔐 Acesso Restrito")
        st.markdown("### Sistema Financeiro Farmácia")
        with st.form("login_form"):
            st.text_input("Usuário", key="form_user")
            st.text_input("Senha", type="password", key="form_senha")
            st.form_submit_button("Entrar", on_click=realizar_login)

        st.info("Primeiro acesso? Use **admin** / **admin123**")

    st.stop()  # PARA O CÓDIGO AQUI SE NÃO ESTIVER LOGADO

# ==============================================================================
# SISTEMA PRINCIPAL (APENAS LOGADOS)
# ==============================================================================

USUARIO_ATUAL = st.session_state['usuario_nome']


# --- FUNÇÕES AUXILIARES ---
def decifrar_boleto(linha):
    if not linha: return None, 0.0, ""
    linha = ''.join(filter(str.isdigit, linha))
    try:
        if linha.startswith('8'):
            val = 0.0
            if len(linha) == 48:
                barras = linha[0:11] + linha[12:23] + linha[24:35] + linha[36:47]
                if len(barras) == 44: val = int(barras[4:15]) / 100.0
            elif len(linha) == 44:
                val = int(linha[4:15]) / 100.0
            return None, val, "Concessionária"
        else:
            if len(linha) == 47:
                fator, val_str = linha[33:37], linha[37:]
            elif len(linha) == 44:
                fator, val_str = linha[5:9], linha[9:19]
            else:
                return None, 0.0, "Inválido"
            venc = datetime(1997, 10, 7) + timedelta(days=int(fator))
            if venc < (datetime.now() - timedelta(days=3000)): venc += timedelta(days=9000)
            return venc.strftime('%d/%m/%Y'), int(val_str) / 100.0, "Bancário"
    except:
        return None, 0.0, "Erro"


# --- BARRA LATERAL ---
st.sidebar.title(f"Olá, {USUARIO_ATUAL} 👋")
if st.sidebar.button("Sair / Logout"):
    realizar_logout()

st.sidebar.divider()
menu = st.sidebar.radio("Navegação:", ["📊 Dashboard", "📑 Ler Novo Boleto", "📥 Importar Excel", "📦 Exportar/Auditoria"])

# --- DASHBOARD ---
if menu == "📊 Dashboard":
    st.title("📈 Painel Financeiro")
    tab_lista, tab_cal, tab_graf = st.tabs(["📋 Lista", "📅 Calendário", "📊 Gráficos"])

    # ABA 1: LISTA
    with tab_lista:
        c1, c2, c3, c4 = st.columns([2, 1, 1, 1])
        busca = c1.text_input("🔍 Buscar", placeholder="Fornecedor")
        status = c2.selectbox("Status", ["Todos", "Pendente", "Pago"])
        cat = c3.selectbox("Categoria", ["Todas"] + CATEGORIAS)
        per = c4.selectbox("Período", ["Tudo", "Este Mês", "Este Ano"])

        d_ini, d_fim = None, None
        hj = datetime.now()
        if per == "Este Mês":
            d_ini = hj.replace(day=1).strftime('%Y-%m-%d')
            d_fim = ((hj.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).strftime('%Y-%m-%d')
        elif per == "Este Ano":
            d_ini, d_fim = hj.strftime('%Y-01-01'), hj.strftime('%Y-12-31')

        total = db.contar_registros(busca, status, cat, d_ini, d_fim)
        paginas = math.ceil(total / 10)
        if 'pag' not in st.session_state: st.session_state.pag = 1
        if st.session_state.pag > paginas and paginas > 0: st.session_state.pag = paginas
        if paginas == 0: st.session_state.pag = 1

        offset = (st.session_state.pag - 1) * 10
        df = db.listar_registros(busca, status, cat, d_ini, d_fim, 10, offset)

        if not df.empty:
            st.write(f"**{total}** registros (Página {st.session_state.pag}/{paginas})")
            for _, row in df.iterrows():
                aviso = ""
                if row['status'] == 'Pendente':
                    try:
                        dias = (datetime.strptime(row['vencimento'], '%d/%m/%Y').date() - hj.date()).days
                        if dias < 0:
                            aviso = f"🚨 ATRASADO {abs(dias)} DIAS"
                        elif dias == 0:
                            aviso = "🔥 VENCE HOJE"
                    except:
                        pass

                titulo = f"{'✅' if row['status'] == 'Pago' else '📅'} {row['vencimento']} - {row['descricao']} | R$ {row['valor']:,.2f} {aviso}"
                with st.expander(titulo):
                    c_a, c_b, c_c = st.columns([2, 1, 1])
                    c_a.code(row['codigo_barras'], language="text")
                    c_a.caption(f"Categoria: {row['categoria']}")
                    with c_b:
                        if row['status'] == 'Pendente':
                            if st.button("Baixar", key=f"p{row['id']}"):
                                db.atualizar_status(USUARIO_ATUAL, row['id'], 'Pago');
                                st.rerun()
                        else:
                            if st.button("Reabrir", key=f"u{row['id']}"):
                                db.atualizar_status(USUARIO_ATUAL, row['id'], 'Pendente');
                                st.rerun()
                    with c_c:
                        with st.popover("Excluir"):
                            if st.button("Confirmar", key=f"d{row['id']}", type="primary"):
                                db.excluir_registro(USUARIO_ATUAL, row['id']);
                                st.rerun()

            cp, _, cn = st.columns([1, 2, 1])
            if st.session_state.pag > 1:
                if cp.button("⬅️ Ant"): st.session_state.pag -= 1; st.rerun()
            if st.session_state.pag < paginas:
                if cn.button("Prox ➡️"): st.session_state.pag += 1; st.rerun()
        else:
            st.info("Nada encontrado.")

    # ABA 2: CALENDÁRIO
    with tab_cal:
        evs = db.obter_dados_calendario()
        # CSS Correção Dark Mode e Tamanho
        css_dark = """
            .fc-col-header-cell-cushion, .fc-daygrid-day-number, .fc-toolbar-title { color: #FFFFFF !important; text-decoration: none !important; }
            .fc-button { background-color: #FF4B4B !important; border: none !important; color: white !important; }
            .fc-theme-standard td, .fc-theme-standard th { border-color: #444 !important; }
        """
        # A chave 'key' única é essencial para não travar
        if evs:
            calendar(
                events=evs,
                options={"initialView": "dayGridMonth", "locale": "pt-br", "height": 650},
                custom_css=css_dark,
                key="cal_principal_v2"
            )
        else:
            st.info("Sem dados para o calendário.")

    # ABA 3: GRÁFICOS
    with tab_graf:
        cg1, cg2 = st.columns(2)
        with cg1:
            st.write("Por Mês")
            dft = db.obter_dados_grafico_tempo()
            if not dft.empty: st.bar_chart(dft.set_index('mes'))
        with cg2:
            st.write("Por Categoria")
            dfc = db.obter_dados_grafico_categoria()
            if not dfc.empty: st.bar_chart(dfc.set_index('categoria'), horizontal=True)

# --- LER BOLETO ---
elif menu == "📑 Ler Novo Boleto":
    st.title("📑 Novo Lançamento")
    if st.session_state.get('sucesso'):
        st.session_state.input_codigo = "";
        st.session_state.sucesso = False
    if "input_codigo" not in st.session_state: st.session_state.input_codigo = ""

    cod = st.text_input("Código de Barras", key="input_codigo")
    if cod:
        venc, val, tipo = decifrar_boleto(cod)
        if tipo == "Concessionária": st.warning("Confira a data de vencimento.")
        if not venc: venc = datetime.now().strftime('%d/%m/%Y')

        if tipo in ["Bancário", "Concessionária"]:
            with st.form("add"):
                c1, c2 = st.columns(2)
                desc = c1.text_input("Descrição")
                valor = c2.number_input("Valor", value=val, min_value=0.01)
                c3, c4 = st.columns(2)
                dt = c3.text_input("Vencimento", value=venc)
                cat = c4.selectbox("Categoria", CATEGORIAS)
                stt = st.selectbox("Status", ["Pendente", "Pago"])

                if st.form_submit_button("Salvar"):
                    if not desc:
                        st.error("Descrição vazia.")
                    elif db.verificar_existencia_boleto(cod):
                        st.error("Duplicado.")
                    else:
                        db.adicionar_registro(USUARIO_ATUAL, datetime.now().strftime('%d/%m/%Y'), desc, valor, cod, dt,
                                              stt, cat)
                        st.toast("Salvo!");
                        st.session_state.sucesso = True;
                        st.rerun()

# --- IMPORTAR / EXPORTAR ---
elif menu == "📥 Importar Excel":
    st.title("Importar");
    arq = st.file_uploader("Excel", ["xlsx"])
    if arq and st.button("Processar"):
        try:
            db.importar_dataframe(USUARIO_ATUAL, pd.read_excel(arq)); st.success("Ok!")
        except Exception as e:
            st.error(e)

elif menu == "📦 Exportar/Auditoria":
    st.title("Dados & Auditoria")
    tab_exp, tab_logs = st.tabs(["📥 Exportar Dados", "🛡️ Logs de Segurança"])

    with tab_exp:
        st.write("Baixar dados financeiros:")
        df = db.listar_registros()
        if not df.empty: st.download_button("CSV Financeiro", df.to_csv(index=False).encode('utf-8'), "dados.csv")

    with tab_logs:
        st.subheader("Quem fez o quê?")
        df_logs = db.obter_logs()
        if not df_logs.empty:
            st.dataframe(df_logs, use_container_width=True)
        else:
            st.write("Nenhum log registrado.")