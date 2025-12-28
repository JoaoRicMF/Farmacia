import streamlit as st
import pandas as pd
import sqlite3
import os
from datetime import datetime, timedelta
from streamlit_calendar import calendar

#CONFIGURAÇÕES E BANCO DE DADOS
st.set_page_config(page_title="Financeiro Farmácia", layout="wide", page_icon="🏥")

if not os.path.exists('database'):
    os.makedirs('database')

conn = sqlite3.connect('database/financeiro.db', check_same_thread=False)
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS financeiro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_registro TEXT,
        descricao TEXT,
        valor REAL,
        codigo_barras TEXT,
        vencimento TEXT,
        status TEXT
    )
''')
conn.commit()


# FUNÇÕES
def decifrar_boleto(linha):
    """Extrai vencimento e valor do padrão de boletos bancários brasileiros."""
    linha = ''.join(filter(str.isdigit, linha))
    if len(linha) < 47: return None, 0.0
    try:
        fator_vencimento = int(linha[33:37])
        vencimento = datetime(1997, 10, 7) + timedelta(days=fator_vencimento)
        valor = int(linha[37:]) / 100.0
        return vencimento.strftime('%d/%m/%Y'), valor
    except:
        return None, 0.0


def atualizar_status(id_registro, novo_status):
    cursor.execute("UPDATE financeiro SET status = ? WHERE id = ?", (novo_status, id_registro))
    conn.commit()


def excluir_registro(id_registro):
    cursor.execute("DELETE FROM financeiro WHERE id = ?", (id_registro,))
    conn.commit()


# BARRA LATERAL
st.sidebar.title("🏥 Gestão Farmácia")
menu = st.sidebar.radio("Navegação:", ["📊 Dashboard", "📑 Ler Novo Boleto", "📥 Importar Excel", "📦 Exportar Dados"])

st.sidebar.divider()
st.sidebar.info("Dica: Use o leitor de código de barras na tela de 'Ler Novo Boleto'.")

# TELAS DO SISTEMA

# DASHBOARD
if menu == "📊 Dashboard":
    st.title("📈 Painel Financeiro")

    # Busca e Filtros
    col_busca, col_filtro = st.columns([2, 1])
    busca = col_busca.text_input("🔍 Buscar por fornecedor ou descrição")
    filtro_status = col_filtro.selectbox("Filtrar Status", ["Todos", "Pendente", "Pago"])

    # Carregar Dados
    query = "SELECT * FROM financeiro"
    df = pd.read_sql(query, conn)

    if not df.empty:
        if busca:
            df = df[df['descricao'].str.contains(busca, case=False, na=False)]
        if filtro_status != "Todos":
            df = df[df['status'] == filtro_status]

        # Métricas
        m1, m2, m3 = st.columns(3)
        m1.metric("Total Pendente", f"R$ {df[df['status'] == 'Pendente']['valor'].sum():,.2f}", delta_color="inverse")
        m2.metric("Total Pago", f"R$ {df[df['status'] == 'Pago']['valor'].sum():,.2f}")
        m3.metric("Qtd Documentos", len(df))

        st.divider()

        # Tabela de Gerenciamento
        st.subheader("📋 Lançamentos")
        for index, row in df.iterrows():
            with st.expander(f"{row['vencimento']} - {row['descricao']} | R$ {row['valor']:,.2f} ({row['status']})"):
                c1, c2, c3 = st.columns([2, 1, 1])
                c1.write(f"**Código:** `{row['codigo_barras']}`")
                if row['status'] == 'Pendente':
                    if c2.button("✅ Marcar como Pago", key=f"pay_{row['id']}"):
                        atualizar_status(row['id'], 'Pago')
                        st.rerun()
                else:
                    if c2.button("↩️ Reverter para Pendente", key=f"unpay_{row['id']}"):
                        atualizar_status(row['id'], 'Pendente')
                        st.rerun()

                if c3.button("🗑️ Excluir", key=f"del_{row['id']}"):
                    excluir_registro(row['id'])
                    st.rerun()

        # Exportação
        st.download_button("📥 Baixar tudo em Excel", data=df.to_csv(index=False).encode('utf-8'),
                           file_name=f"financeiro_farmacia_{datetime.now().strftime('%Y%m%d')}.csv", mime="text/csv")
    else:
        st.info("Nenhum registro encontrado.")

# LER BOLETO
elif menu == "📑 Ler Novo Boleto":
    st.title("📑 Entrada de Boleto")
    codigo_lido = st.text_input("Aponte o leitor de código de barras para o boleto",
                                placeholder="Clique aqui antes de bipar...")

    if codigo_lido:
        venc, val = decifrar_boleto(codigo_lido)

        if venc:
            with st.form("confirmar_boleto"):
                st.success(f"Boleto Identificado! Vencimento: {venc} | Valor: R$ {val:,.2f}")
                desc_input = st.text_input("Fornecedor / Descrição (Ex: Lab. Medley)")
                status_input = st.selectbox("Status Inicial", ["Pendente", "Pago"])

                if st.form_submit_button("Confirmar e Salvar no Banco"):
                    if desc_input:
                        cursor.execute('''
                            INSERT INTO financeiro (data_registro, descricao, valor, codigo_barras, vencimento, status)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (datetime.now().strftime('%d/%m/%Y'), desc_input, val, codigo_lido, venc, status_input))
                        conn.commit()
                        st.balloons()
                        st.success("Salvo com sucesso!")
                    else:
                        st.warning("Por favor, digite uma descrição.")
        else:
            st.error("Código de barras inválido ou formato não suportado.")

# IMPORTAR EXCEL
elif menu == "📥 Importar Excel":
    st.title("📥 Importar Planilha")
    st.write("A planilha deve conter as colunas: `descricao`, `valor`, `vencimento`, `status`")
    arquivo = st.file_uploader("Selecione o arquivo Excel", type=["xlsx"])

    if arquivo:
        df_excel = pd.read_excel(arquivo)
        st.dataframe(df_excel)
        if st.button("Confirmar Importação em Massa"):
            df_excel['data_registro'] = datetime.now().strftime('%d/%m/%Y')
            df_excel.to_sql('financeiro', conn, if_exists='append', index=False)
            st.success("Dados importados com sucesso!")

# EXPORTAR EXCEL
elif menu == "📦 Exportar Dados":
    st.title("📦 Exportar Relatórios")
    st.write("Gere planilhas para o seu contador ou para controle de estoque/financeiro.")

    # Carregar dados atuais
    df_export = pd.read_sql("SELECT * FROM financeiro", conn)

    if not df_export.empty:
        col1, col2 = st.columns(2)

        with col1:
            st.subheader("Configurações da Planilha")
            formato = st.selectbox("Escolha o formato do arquivo:", ["Excel (.xlsx)", "CSV (.csv)"])
            filtro_exp = st.multiselect("Filtrar por Status:", ["Pendente", "Pago"], default=["Pendente", "Pago"])

            # Aplicar filtro antes de exportar
            df_final = df_export[df_export['status'].isin(filtro_exp)]

        with col2:
            st.subheader("Resumo da Exportação")
            st.write(f"**Total de registros:** {len(df_final)}")
            st.write(f"**Valor total:** R$ {df_final['valor'].sum():,.2f}")

        st.divider()

        # Botão de Download
        if formato == "Excel (.xlsx)":
            import io

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_final.to_excel(writer, index=False, sheet_name='Financeiro')

            st.download_button(
                label="📥 Baixar Planilha Excel",
                data=output.getvalue(),
                file_name=f"financeiro_farmacia_{datetime.now().strftime('%d_%m_%Y')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        else:
            # Exportação em CSV
            csv = df_final.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Baixar Arquivo CSV",
                data=csv,
                file_name=f"financeiro_farmacia_{datetime.now().strftime('%d_%m_%Y')}.csv",
                mime="text/csv"
            )

        st.info("Nota: O arquivo gerado será salvo na sua pasta de 'Downloads' padrão.")
    else:
        st.warning("Não há dados no banco para exportar.")