import pandas as pd
from datetime import datetime, timedelta

def converter_datas(df: pd.DataFrame) -> pd.DataFrame:
    """
    Converte a coluna de vencimento para datetime do Pandas (Timestamp).
    Agora lida com objetos db.Date nativos ou strings ISO do banco.
    """
    if df.empty:
        return df

    # Garante que 'vencimento' seja tratado como data.
    # Removemos 'dayfirst=True' pois o banco agora retorna objetos date ou ISO (YYYY-MM-DD).
    df['dt_venc'] = pd.to_datetime(df['vencimento'], errors='coerce')

    return df

def calcular_cards_dashboard(df: pd.DataFrame) -> dict:
    """Calcula os totais para os cards do topo do dashboard."""
    vals = {
        'pagar_mes': 0.0,
        'pago_mes': 0.0,
        'vencidos_val': 0.0,
        'vencidos_qtd': 0,
        'proximos_val': 0.0,
        'proximos_qtd': 0
    }

    if df.empty:
        return vals

    df = converter_datas(df)

    # Normaliza 'hoje' para meia-noite para comparações justas de data
    hoje = pd.Timestamp(datetime.now().date())

    # Máscaras booleanas
    m_pendente = (df['status'] == 'Pendente')
    m_pago = (df['status'] == 'Pago')

    # Filtros temporais usando o acessor .dt
    # Verifica se a data é válida (não NaT) antes de comparar
    m_data_valida = df['dt_venc'].notna()

    m_mes_atual = (df['dt_venc'].dt.month == hoje.month) & (df['dt_venc'].dt.year == hoje.year)

    m_vencido = m_pendente & m_data_valida & (df['dt_venc'] < hoje)

    # Próximos 7 dias (incluindo hoje)
    m_prox = m_pendente & m_data_valida & (df['dt_venc'] >= hoje) & (df['dt_venc'] <= hoje + timedelta(days=7))

    # Cálculos
    vals['pagar_mes'] = df[m_pendente & m_data_valida]['valor'].sum()
    vals['pago_mes'] = df[m_pago & m_data_valida & m_mes_atual]['valor'].sum()
    vals['vencidos_val'] = df[m_vencido]['valor'].sum()
    vals['vencidos_qtd'] = int(df[m_vencido].shape[0])
    vals['proximos_val'] = df[m_prox]['valor'].sum()
    vals['proximos_qtd'] = int(df[m_prox].shape[0])

    return vals

def gerar_dados_graficos(df: pd.DataFrame, periodo: str) -> dict:
    """Gera os dados para os gráficos Chart.js com base no período."""
    grafico_tempo = []
    grafico_cat = []

    if df.empty:
        return {'por_mes': [], 'por_categoria': []}

    df = converter_datas(df)

    # Remove registros sem data para o gráfico temporal
    df_chart = df.dropna(subset=['dt_venc']).copy()

    hoje_chart = pd.Timestamp(datetime.now().date())
    start_date = None
    freq = 'M' # Mensal por padrão

    # Define janela de tempo
    if periodo == '7d':
        start_date = hoje_chart - timedelta(days=7)
        freq = 'D'
    elif periodo == '30d':
        start_date = hoje_chart - timedelta(days=30)
        freq = 'D'
    elif periodo == '3m':
        start_date = hoje_chart - timedelta(days=90)
        freq = 'M'
    elif periodo == '1y':
        start_date = hoje_chart - timedelta(days=365)
        freq = 'M'
    # 'all' não define start_date

    if start_date:
        df_chart = df_chart[df_chart['dt_venc'] >= start_date]

    if not df_chart.empty:
        # --- Gráfico Temporal ---
        if freq == 'D':
            # Agrupa por Dia/Mês (ex: 05/02)
            # dt.strftime funciona bem com Timestamp
            g = df_chart.groupby(df_chart['dt_venc'].dt.strftime('%d/%m')).agg({'valor': 'sum'}).reset_index()
            g.columns = ['mes', 'total'] # Front espera a chave 'mes' como label X
            grafico_tempo = g.to_dict(orient='records')
        else:
            # Agrupa por Mês/Ano (Ordenação correta usando Period)
            df_chart['periodo_ordem'] = df_chart['dt_venc'].dt.to_period('M')
            g = df_chart.groupby('periodo_ordem').agg({'valor': 'sum'}).reset_index()
            g = g.rename(columns={'valor': 'total'})

            # Converte de volta para string legível para o gráfico
            g['mes'] = g['periodo_ordem'].dt.strftime('%m/%Y')

            # Ordena cronologicamente e pega apenas as colunas finais
            g = g.sort_values('periodo_ordem')
            grafico_tempo = g[['mes', 'total']].to_dict(orient='records')

        # --- Gráfico Categoria ---
        # (Não depende do tempo, mas respeita o filtro de período aplicado acima)
        g_cat = df_chart.groupby('categoria')['valor'].sum().sort_values(ascending=False).reset_index()
        g_cat.columns = ['categoria', 'total']
        grafico_cat = g_cat.to_dict(orient='records')

    return {
        'por_mes': grafico_tempo,
        'por_categoria': grafico_cat
    }

def filtrar_dados_detalhes(df: pd.DataFrame, tipo: str) -> pd.DataFrame:
    """Filtra o DataFrame para a tabela de detalhes (Modals)."""
    if df.empty: return pd.DataFrame()

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())
    filtrado = pd.DataFrame()

    # Garante que temos datas válidas para as lógicas de filtro
    mask_valid = df['dt_venc'].notna()

    if tipo == 'pagar_mes':
        filtrado = df[df['status'] == 'Pendente']
    elif tipo == 'vencidos':
        filtrado = df[mask_valid & (df['status'] == 'Pendente') & (df['dt_venc'] < hoje)]
    elif tipo == 'proximos':
        filtrado = df[mask_valid & (df['status'] == 'Pendente') & (df['dt_venc'] >= hoje) & (df['dt_venc'] <= hoje + timedelta(days=7))]
    elif tipo == 'pago_mes':
        filtrado = df[mask_valid & (df['status'] == 'Pago') & (df['dt_venc'].dt.month == hoje.month) & (df['dt_venc'].dt.year == hoje.year)]

    # Limpeza para retorno JSON
    if not filtrado.empty:
        # Formata a data para visualização BR antes de enviar
        filtrado['vencimento'] = filtrado['dt_venc'].dt.strftime('%d/%m/%Y')
        # Remove a coluna auxiliar
        if 'dt_venc' in filtrado.columns: del filtrado['dt_venc']

    return filtrado.fillna('')

def gerar_eventos_calendario(df: pd.DataFrame) -> list:
    """Gera lista de eventos para o FullCalendar."""
    eventos = []
    if df.empty: return eventos

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())

    for _, row in df.iterrows():
        # Pula registros sem data válida
        if pd.isna(row['dt_venc']):
            continue

        # Lógica de Cores
        if row['status'] == 'Pago':
            cor = '#10b981' # Verde
        elif row['dt_venc'] < hoje:
            cor = '#ef4444' # Vermelho (Vencido)
        else:
            cor = '#f59e0b' # Amarelo (A vencer)

        eventos.append({
            'id': row['id'],
            'title': f"R$ {row['valor']:.2f} - {row['descricao']}",
            'start': row['dt_venc'].strftime('%Y-%m-%d'), # Formato ISO exigido pelo Calendar
            'backgroundColor': cor,
            'borderColor': cor,
            'allDay': True,
            'extendedProps': {
                'status': row['status'],
                'valor': row['valor']
            }
        })
    return eventos