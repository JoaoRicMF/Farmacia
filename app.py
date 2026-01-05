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

    # Agora criamos apenas duas abas: uma para a Lista e outra para o Painel Visual (Calendário + Gráficos)
    tab_lista, tab_visual = st.tabs(["📋 Lista de Registros", "🖼️ Painel Visual (Calendário e Gráficos)"])

    # --- ABA 1: LISTA ---
    with tab_lista:
        c1, c2, c3, c4 = st.columns([2, 1, 1, 1])
        busca = c1.text_input("🔍 Buscar", placeholder="Fornecedor")
        status_sel = c2.selectbox("Status", ["Todos", "Pendente", "Pago"])
        cat_sel = c3.selectbox("Categoria", ["Todas"] + CATEGORIAS)
        per_sel = c4.selectbox("Período", ["Tudo", "Este Mês", "Este Ano"])

        d_ini, d_fim = None, None
        hj = datetime.now()
        if per_sel == "Este Mês":
            d_ini = hj.replace(day=1).strftime('%Y-%m-%d')
            d_fim = ((hj.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).strftime('%Y-%m-%d')
        elif per_sel == "Este Ano":
            d_ini, d_fim = hj.strftime('%Y-01-01'), hj.strftime('%Y-12-31')

        total = db.contar_registros(busca, status_sel, cat_sel, d_ini, d_fim)
        paginas = math.ceil(total / 10) if total > 0 else 1

        if 'pag' not in st.session_state: st.session_state.pag = 1
        if st.session_state.pag > paginas: st.session_state.pag = paginas

        offset = (st.session_state.pag - 1) * 10
        df_list = db.listar_registros(busca, status_sel, cat_sel, d_ini, d_fim, 10, offset)

        if not df_list.empty:
            for _, row in df_list.iterrows():
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

                titulo_exp = f"{'✅' if row['status'] == 'Pago' else '📅'} {row['vencimento']} - {row['descricao']} | R$ {row['valor']:,.2f} {aviso}"
                with st.expander(titulo_exp):
                    c_a, c_b, c_c = st.columns([2, 1, 1])
                    c_a.code(row['codigo_barras'], language="text")
                    c_a.caption(f"Categoria: {row['categoria']}")
                    with c_b:
                        if row['status'] == 'Pendente':
                            if st.button("Pagar", key=f"p_{row['id']}"):
                                db.atualizar_status(USUARIO_ATUAL, row['id'], 'Pago')
                                st.rerun()
                        else:
                            if st.button("Reabrir", key=f"u_{row['id']}"):
                                db.atualizar_status(USUARIO_ATUAL, row['id'], 'Pendente')
                                st.rerun()
                    with c_c:
                        with st.popover("Excluir"):
                            if st.button("Confirmar", key=f"d_{row['id']}", type="primary"):
                                db.excluir_registro(USUARIO_ATUAL, row['id'])
                                st.rerun()

            cp, _, cn = st.columns([1, 2, 1])
            if st.session_state.pag > 1:
                if cp.button("⬅️ Ant"): st.session_state.pag -= 1; st.rerun()
            if st.session_state.pag < paginas:
                if cn.button("Prox ➡️"): st.session_state.pag += 1; st.rerun()
        else:
            st.info("Nada encontrado.")

    # --- ABA 2: PAINEL VISUAL (CALENDÁRIO + GRÁFICOS JUNTOS) ---
    with tab_visual:

        st.subheader("📊 Análise de Despesas")
        g1, g2 = st.columns(2)

        with g1:
            st.write("**Total por Mês**")
            df_t = db.obter_dados_grafico_tempo()
            if not df_t.empty:
                st.bar_chart(df_t.set_index("mes"))

        with g2:
            st.write("**Total por Categoria**")
            df_c = db.obter_dados_grafico_categoria()
            if not df_c.empty:
                st.bar_chart(df_c.set_index("categoria"), horizontal=True)


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
            db.importar_dataframe(USUARIO_ATUAL, pd.read_excel(arq));
            st.success("Ok!")
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
            st.dataframe(df_logs, width=True)
        else:
            st.write("Nenhum log registrado.")