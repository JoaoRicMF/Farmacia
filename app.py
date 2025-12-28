import streamlit as st
import pandas as pd
import sqlite3
import os
from datetime import datetime, timedelta

# --- CONFIGURAÇÕES INICIAIS ---
st.set_page_config(page_title="Gestão Farmácia", layout="wide")

# Criar pasta do banco se não existir
if not os.path.exists('database'):
    os.makedirs('database')

# Conexão com Banco
conn = sqlite3.connect('database/financeiro.db', check_same_thread=False)
cursor = conn.cursor()

# Criar tabela se não existir
cursor.execute('''
    CREATE TABLE IF NOT EXISTS financeiro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_processamento TEXT,
        descricao TEXT,
        valor REAL,
        codigo_barras TEXT,
        vencimento TEXT,
        status TEXT
    )
''')
conn.commit()


# --- FUNÇÕES DE APOIO ---
def decifrar_boleto(linha):
    """Extrai data e valor de boletos bancários (padrão 47-48 dígitos)"""
    linha = ''.join(filter(str.isdigit, linha))  # remove pontos e espaços

    if len(linha) < 47:
        return None, 0.0

    # O fator de vencimento são os 4 dígitos após o código do banco/moeda
    # Para boletos de cobrança (iniciados com 0-9)
    fator_vencimento = int(linha[33:37])
    data_base = datetime(1997, 10, 7)
    vencimento = data_base + timedelta(days=fator_vencimento)

    # O valor são os últimos 10 dígitos
    valor_centavos = int(linha[37:])
    valor_real = valor_centavos / 100.0

    return vencimento.strftime('%d/%m/%Y'), valor_real


# --- INTERFACE ---
st.title("Sistema Farmácia")
st.sidebar.title("Navegação")

menu = st.sidebar.radio(
    "Selecione uma opção:",
    ["Dashboard", "Importar Excel", "Ler Boleto"],
    index=0 # Define que o Dashboard começa selecionado
)

st.sidebar.markdown("---")
st.sidebar.write("**Usuário:** João (Farmácia)")

if menu == "Dashboard":
    st.header("Resumo Financeiro")
    dados = pd.read_sql("SELECT * FROM financeiro", conn)

    if not dados.empty:
        col1, col2 = st.columns(2)
        col1.metric("Total em Contas", f"R$ {dados['valor'].sum():,.2f}")
        col2.metric("Qtd Lançamentos", len(dados))
        st.subheader("Lançamentos Recentes")
        st.dataframe(dados.sort_index(ascending=False), use_container_width=True)
    else:
        st.info("Nenhum dado cadastrado ainda.")

elif menu == "Importar Excel":
    st.header("Upload de Planilha de Gastos")
    arquivo = st.file_uploader("Selecione o arquivo .xlsx", type=["xlsx"])

    if arquivo:
        df = pd.read_excel(arquivo)
        st.dataframe(df)

        if st.button("Salvar no Banco de Dados"):
            df['data_processamento'] = datetime.now().strftime('%d/%m/%Y %H:%M')
            df.to_sql('financeiro', conn, if_exists='append', index=False)
            st.success("Dados da planilha salvos!")

elif menu == "Ler Boleto":
    st.header("Leitor de Boletos")

    # Campo para o leitor de código de barras
    codigo = st.text_input("Passe o leitor ou digite a linha digitável",
                           placeholder="Clique aqui antes de usar o leitor")

    if codigo:
        vencimento, valor = decifrar_boleto(codigo)

        if vencimento:
            st.markdown("---")
            col1, col2, col3 = st.columns(3)
            col1.info(f"**Vencimento:** {vencimento}")
            col2.success(f"**Valor:** R$ {valor:,.2f}")

            with st.form("form_boleto"):
                desc = st.text_input("Descrição (Ex: Fornecedor Medley)")
                status = st.selectbox("Status", ["Pendente", "Pago"])

                if st.form_submit_button("Confirmar Lançamento"):
                    cursor.execute('''
                        INSERT INTO financeiro (data_processamento, descricao, valor, codigo_barras, vencimento, status)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (datetime.now().strftime('%d/%m/%Y'), desc, valor, codigo, vencimento, status))
                    conn.commit()
                    st.success(f"Boleto de R$ {valor} salvo com sucesso!")
        else:
            st.error("Linha digitável inválida ou incompleta.")