import pandas as pd
from datetime import datetime, timedelta

def converter_datas(df: pd.DataFrame) -> pd.DataFrame:
    """Converte coluna de vencimento para datetime."""
    if df.empty: return df
    df['dt_venc'] = pd.to_datetime(df['vencimento'], dayfirst=True, errors='coerce')
    return df

def calcular_cards_dashboard(df: pd.DataFrame) -> dict:
    """Calcula os totais para os cards do topo do dashboard."""
    vals = {'pagar_mes': 0.0, 'pago_mes': 0.0, 'vencidos_val': 0.0, 'vencidos_qtd': 0, 'proximos_val': 0.0, 'proximos_qtd': 0}

    if df.empty:
        return vals

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())

    m_pendente = (df['status'] == 'Pendente')
    m_pago_mes = (df['status'] == 'Pago') & (df['dt_venc'].dt.month == hoje.month) & (df['dt_venc'].dt.year == hoje.year)
    m_vencido = (df['status'] == 'Pendente') & (df['dt_venc'] < hoje)
    m_prox = (df['status'] == 'Pendente') & (df['dt_venc'] >= hoje) & (df['dt_venc'] <= hoje + timedelta(days=7))

    vals['pagar_mes'] = df[m_pendente]['valor'].sum()
    vals['pago_mes'] = df[m_pago_mes]['valor'].sum()
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
    df_chart = df.copy()
    hoje_chart = pd.Timestamp(datetime.now().date())
    start_date = None
    freq = 'M'

    if periodo == '7d':
        start_date = hoje_chart - timedelta(days=7); freq = 'D'
    elif periodo == '30d':
        start_date = hoje_chart - timedelta(days=30); freq = 'D'
    elif periodo == '3m':
        start_date = hoje_chart - timedelta(days=90); freq = 'M'
    elif periodo == '1y':
        start_date = hoje_chart - timedelta(days=365); freq = 'M'

    if start_date:
        df_chart = df_chart[df_chart['dt_venc'] >= start_date]

    if not df_chart.empty:
        # Gráfico Temporal
        if freq == 'D':
            g = df_chart.groupby(df_chart['dt_venc'].dt.strftime('%d/%m')).agg({'valor': 'sum'}).reset_index()
            g.columns = ['mes', 'total']
            grafico_tempo = g.to_dict(orient='records')
        else:
            df_chart['mes_ordem'] = df_chart['dt_venc'].dt.to_period('M')
            g = df_chart.groupby('mes_ordem').agg({'valor': 'sum'}).reset_index()
            # --- CORREÇÃO AQUI ---
            # Renomeia 'valor' para 'total' antes de selecionar
            g = g.rename(columns={'valor': 'total'})
            g['mes'] = g['mes_ordem'].dt.strftime('%m/%Y')
            grafico_tempo = g[['mes', 'total']].to_dict(orient='records')

        # Gráfico Categoria
        g_cat = df_chart.groupby('categoria')['valor'].sum().sort_values(ascending=False).reset_index()
        g_cat.columns = ['categoria', 'total']
        grafico_cat = g_cat.to_dict(orient='records')

    return {
        'por_mes': grafico_tempo,
        'por_categoria': grafico_cat
    }

def filtrar_dados_detalhes(df: pd.DataFrame, tipo: str) -> pd.DataFrame:
    """Filtra o DataFrame para a tabela de detalhes."""
    if df.empty: return pd.DataFrame()

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())
    filtrado = pd.DataFrame()

    if tipo == 'pagar_mes':
        filtrado = df[df['status'] == 'Pendente']
    elif tipo == 'vencidos':
        filtrado = df[(df['status'] == 'Pendente') & (df['dt_venc'] < hoje)]
    elif tipo == 'proximos':
        filtrado = df[(df['status'] == 'Pendente') & (df['dt_venc'] >= hoje) & (df['dt_venc'] <= hoje + timedelta(days=7))]
    elif tipo == 'pago_mes':
        filtrado = df[(df['status'] == 'Pago') & (df['dt_venc'].dt.month == hoje.month) & (df['dt_venc'].dt.year == hoje.year)]

    if 'dt_venc' in filtrado.columns: del filtrado['dt_venc']
    return filtrado.fillna('')

def gerar_eventos_calendario(df: pd.DataFrame) -> list:
    """Gera lista de eventos para o FullCalendar."""
    eventos = []
    if df.empty: return eventos

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())

    for _, row in df.iterrows():
        if pd.isna(row['dt_venc']): continue
        cor = '#10b981' if row['status'] == 'Pago' else ('#ef4444' if row['dt_venc'] < hoje else '#f59e0b')
        eventos.append({
            'id': row['id'],
            'title': f"R$ {row['valor']:.2f} - {row['descricao']}",
            'start': row['dt_venc'].strftime('%Y-%m-%d'),
            'backgroundColor': cor,
            'borderColor': cor,
            'allDay': True,
            'extendedProps': {'status': row['status'], 'valor': row['valor']}
        })
    return eventos