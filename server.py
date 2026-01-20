import os

from flask import Flask, render_template, request, jsonify, session, Response
import database_manager as db
from datetime import datetime, timedelta
import pandas as pd
import io

app = Flask(__name__, template_folder='templates')
app.secret_key = os.getenv('SECRET_KEY', 'chave_dev_padrao_insira_uma_chave_forte_em_prod')

db.init_db()

# --- HELPER: DATAS ---
def converter_datas(df):
    if df.empty: return df
    df['dt_venc'] = pd.to_datetime(df['vencimento'], dayfirst=True, errors='coerce')
    return df

# --- HELPER: LER BOLETO (CORRIGIDO) ---
def decifrar_boleto(linha):
    if not linha: return None, 0.0, ""
    linha = ''.join(filter(str.isdigit, linha))

    try:
        if linha.startswith('8'):
            val = 0.0
            if len(linha) >= 11:
                val_str = linha[4:15]
                val = int(val_str) / 100.0
            return None, val, "Concessionária"
        else:
            if len(linha) == 47:
                fator = linha[33:37]
                val_str = linha[37:]
            elif len(linha) == 44:
                fator = linha[5:9]
                val_str = linha[9:19]
            else:
                return None, 0.0, "Inválido"

            base = datetime(1997, 10, 7)
            dias = int(fator)
            venc = base + timedelta(days=dias)

            while venc < (datetime.now() - timedelta(days=1000)):
                venc += timedelta(days=9000)

            data_formatada = venc.strftime('%Y-%m-%d')
            valor_final = int(val_str) / 100.0

            return data_formatada, valor_final, "Bancário"

    except Exception as e:
        print(f"Erro ao ler boleto: {e}")
        return None, 0.0, "Erro"

# --- ROTAS DE LOGIN/LOGOUT ---
@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = db.verificar_login(data.get('usuario'), data.get('senha'))
    if user:
        session['usuario'] = user[1]
        session['funcao'] = user[2]
        return jsonify({'success': True, 'nome': user[1], 'funcao': user[2]})
    return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

# --- DASHBOARD ---
@app.route('/api/dashboard', methods=['GET'])
def dashboard_data():
    if 'usuario' not in session: return jsonify({}), 403

    # Parâmetro de filtro (7d, 30d, 3m, 1y, all)
    periodo = request.args.get('periodo', '7d')

    df = db.listar_registros()

    # 1. Dados dos CARDS (Sempre baseados no 'Agora' e totais, sem filtro de visualização)
    vals = {'pagar_mes':0, 'pago_mes':0, 'vencidos_val':0, 'vencidos_qtd':0, 'proximos_val':0, 'proximos_qtd':0}

    if not df.empty:
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

    # 2. Dados dos GRÁFICOS (Com filtro de período)
    grafico_tempo = []
    grafico_cat = []

    if not df.empty:
        df_chart = df.copy()

        # Filtra a data de início
        start_date = None
        freq = 'M' # Padrão Mensal

        hoje_chart = pd.Timestamp(datetime.now().date())

        if periodo == '7d':
            start_date = hoje_chart - timedelta(days=7)
            freq = 'D' # Diário
        elif periodo == '30d':
            start_date = hoje_chart - timedelta(days=30)
            freq = 'D' # Diário
        elif periodo == '3m':
            start_date = hoje_chart - timedelta(days=90)
            freq = 'M'
        elif periodo == '1y':
            start_date = hoje_chart - timedelta(days=365)
            freq = 'M'
        # 'all' não filtra start_date

        if start_date:
            df_chart = df_chart[df_chart['dt_venc'] >= start_date]

        # Agregação para Gráfico de Tempo
        if not df_chart.empty:
            if freq == 'D':
                # Agrupa por DIA (ex: 20/01)
                g = df_chart.groupby(df_chart['dt_venc'].dt.strftime('%d/%m')).agg({'valor': 'sum'}).reset_index()
                g.columns = ['mes', 'total'] # Mantém chave 'mes' para compatibilidade frontend
                # Ordena (gambiarra leve pois string DD/MM ordena ok dentro do mesmo ano/mes, mas ideal é ordenar pelo index original)
                # Para simplificar aqui, assumimos ordem correta ou aceitável
                grafico_tempo = g.to_dict(orient='records')
            else:
                # Agrupa por MÊS (ex: 01/2026)
                df_chart['mes_ordem'] = df_chart['dt_venc'].dt.to_period('M')
                g = df_chart.groupby('mes_ordem').agg({'valor': 'sum'}).reset_index()
                g['mes'] = g['mes_ordem'].dt.strftime('%m/%Y')
                grafico_tempo = g[['mes', 'total']].to_dict(orient='records')

        # Agregação para Categoria
        if not df_chart.empty:
            g = df_chart.groupby('categoria')['valor'].sum().sort_values(ascending=False).reset_index()
            g.columns = ['categoria', 'total']
            grafico_cat = g.to_dict(orient='records')

    return jsonify({
        'graficos': {
            'por_mes': grafico_tempo,
            'por_categoria': grafico_cat
        },
        'cards': vals
    })

@app.route('/api/detalhes_card', methods=['POST'])
def detalhes():
    if 'usuario' not in session: return jsonify([]), 403
    tipo = request.json.get('tipo')
    df = db.listar_registros()
    if df.empty: return jsonify([])

    df = converter_datas(df)
    hoje = pd.Timestamp(datetime.now().date())
    filtrado = pd.DataFrame()

    if tipo == 'pagar_mes': filtrado = df[df['status'] == 'Pendente']
    elif tipo == 'vencidos': filtrado = df[(df['status'] == 'Pendente') & (df['dt_venc'] < hoje)]
    elif tipo == 'proximos': filtrado = df[(df['status'] == 'Pendente') & (df['dt_venc'] >= hoje) & (df['dt_venc'] <= hoje + timedelta(days=7))]
    elif tipo == 'pago_mes': filtrado = df[(df['status'] == 'Pago') & (df['dt_venc'].dt.month == hoje.month) & (df['dt_venc'].dt.year == hoje.year)]

    if 'dt_venc' in filtrado.columns: del filtrado['dt_venc']
    return jsonify(filtrado.fillna('').to_dict(orient='records'))

@app.route('/api/calendario', methods=['GET'])
def calendario():
    if 'usuario' not in session: return jsonify([]), 403
    df = db.listar_registros()
    eventos = []
    if not df.empty:
        df = converter_datas(df)
        hoje = pd.Timestamp(datetime.now().date())
        for _, row in df.iterrows():
            if pd.isna(row['dt_venc']): continue
            cor = '#10b981' if row['status'] == 'Pago' else ('#ef4444' if row['dt_venc'] < hoje else '#f59e0b')
            eventos.append({
                'id': row['id'],
                'title': f"R$ {row['valor']:.2f} - {row['descricao']}",
                'start': row['dt_venc'].strftime('%Y-%m-%d'),
                'backgroundColor': cor, 'borderColor': cor, 'allDay': True,
                'extendedProps': {'status': row['status'], 'valor': row['valor']}
            })
    return jsonify(eventos)

# --- CRUD / REGISTROS ---
@app.route('/api/registros', methods=['GET'])
def listar():
    if 'usuario' not in session: return jsonify([]), 403
    p = int(request.args.get('pagina', 1))
    df = db.listar_registros(
        busca=request.args.get('busca', ''),
        status_filtro=request.args.get('status', 'Todos'),
        categoria_filtro=request.args.get('categoria', 'Todas'),
        limit=10,
        offset=(p-1)*10
    )
    total = db.contar_registros_filtro(
        busca=request.args.get('busca', ''),
        status_filtro=request.args.get('status', 'Todos'),
        categoria_filtro=request.args.get('categoria', 'Todas')
    )
    return jsonify({
        'registros': df.to_dict(orient='records'),
        'total_paginas': (total // 10) + (1 if total % 10 > 0 else 0),
        'pagina_atual': p,
        'perm_excluir': session.get('funcao') == 'Admin'
    })

@app.route('/api/ler_codigo', methods=['POST'])
def ler():
    v, val, t = decifrar_boleto(request.json.get('codigo'))
    return jsonify({'vencimento': v, 'valor': val, 'tipo': t})

@app.route('/api/novo_boleto', methods=['POST'])
def add():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json
    try: data_fmt = datetime.strptime(d['vencimento'], '%Y-%m-%d').strftime('%d/%m/%Y')
    except: data_fmt = d['vencimento']

    if db.verificar_existencia_boleto(d['codigo']): return jsonify({'success': False, 'message': 'Duplicado'})

    db.adicionar_registro(session['usuario'], datetime.now().strftime('%d/%m/%Y'), d['descricao'], float(d['valor']), d['codigo'], data_fmt, d['status'], d['categoria'])
    return jsonify({'success': True})

@app.route('/api/editar', methods=['POST'])
def edit():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json
    try: data_fmt = datetime.strptime(d['vencimento'], '%Y-%m-%d').strftime('%d/%m/%Y')
    except: data_fmt = d['vencimento']
    db.editar_registro(session['usuario'], d['id'], d['descricao'], float(d['valor']), data_fmt, d['categoria'], d['status'])
    return jsonify({'success': True})

@app.route('/api/atualizar_status', methods=['POST'])
def status_up():
    if 'usuario' not in session: return jsonify({}), 403
    db.atualizar_status(session['usuario'], request.json['id'], request.json['status'])
    return jsonify({'success': True})

@app.route('/api/excluir', methods=['POST'])
def delete():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin': return jsonify({'success': False, 'message': 'Apenas Admins podem excluir.'}), 403
    db.excluir_registro(session['usuario'], request.json['id'])
    return jsonify({'success': True})

@app.route('/api/logs', methods=['GET'])
def logs():
    if 'usuario' not in session: return jsonify([]), 403
    return jsonify(db.obter_logs().to_dict(orient='records'))

@app.route('/api/exportar', methods=['GET'])
def exportar():
    if 'usuario' not in session: return "", 403
    df = db.listar_registros()
    out = io.StringIO()
    df.to_csv(out, index=False, sep=';', encoding='utf-8-sig')
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-disposition": "attachment; filename=dados.csv"})

@app.route('/api/dados_usuario', methods=['GET'])
def dados_u():
    if 'usuario' not in session: return jsonify({})
    d = db.obter_dados_usuario(session['usuario'])
    return jsonify({'login': d[0], 'nome': d[1]})

@app.route('/api/alterar_perfil', methods=['POST'])
def alt_perf():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    if d.get('nova_senha'): db.alterar_senha_usuario(session['usuario'], d['nova_senha'])
    if d.get('novo_nome'):
        db.atualizar_perfil_usuario(session['usuario'], d['novo_login'], d['novo_nome'])
        session['usuario'] = d['novo_nome']
    return jsonify({'success': True})

# --- fluxo de caixa ---
@app.route('/api/fluxo_resumo', methods=['GET'])
def api_fluxo():
    if 'usuario' not in session: return jsonify({}), 403
    mes = request.args.get('mes')
    ano = request.args.get('ano')
    dados = db.obter_resumo_fluxo(mes, ano)
    return jsonify(dados)

@app.route('/api/nova_entrada', methods=['POST'])
def nova_entrada():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json
    try:
        valor = float(d['valor'])
        db.adicionar_entrada(session['usuario'], valor, d['forma'], d['data'])
        return jsonify({'success': True})
    except Exception as e:
        print(e)
        return jsonify({'success': False, 'message': 'Erro ao salvar entrada'}), 500

@app.route('/api/excluir_entrada', methods=['POST'])
def excluir_entrada_route():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin':
        return jsonify({'success': False, 'message': 'Permissão negada'}), 403
    db.excluir_entrada(session['usuario'], request.json['id'])
    return jsonify({'success': True})

@app.route('/api/nova_saida_caixa', methods=['POST'])
def nova_saida_caixa():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json
    try:
        valor = float(d['valor'])
        db.adicionar_saida_caixa(session['usuario'], d['descricao'], valor, d['forma'], d['data'])
        return jsonify({'success': True})
    except Exception as e:
        print(f"Erro ao salvar saída: {e}")
        return jsonify({'success': False, 'message': 'Erro ao salvar saída'}), 500

@app.route('/api/excluir_saida_caixa', methods=['POST'])
def excluir_saida_caixa():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin':
        return jsonify({'success': False, 'message': 'Permissão negada'}), 403
    db.excluir_saida_caixa(session['usuario'], request.json['id'])
    return jsonify({'success': True})

@app.route('/api/exportar_fluxo_excel', methods=['GET'])
def exportar_fluxo_excel():
    if 'usuario' not in session: return "", 403
    mes = request.args.get('mes')
    ano = request.args.get('ano')
    dados = db.obter_resumo_fluxo(mes, ano)
    extrato = dados['extrato']

    if not extrato: return "Não há dados para exportar neste período.", 404

    df = pd.DataFrame(extrato)
    df_export = df[['data', 'descricao', 'categoria', 'tipo', 'valor']].copy()
    df_export.columns = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']

    out = io.BytesIO()
    with pd.ExcelWriter(out, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name=f'Fluxo {mes}-{ano}')
        resumo_df = pd.DataFrame([
            {'Item': 'Entradas Totais', 'Valor': dados['entradas_total']},
            {'Item': 'Saídas (Pagas)', 'Valor': dados['saidas_total']},
            {'Item': 'Saldo Líquido', 'Valor': dados['saldo']}
        ])
        resumo_df.to_excel(writer, index=False, sheet_name='Resumo')

    out.seek(0)
    return Response(
        out.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment;filename=fluxo_caixa_{mes}_{ano}.xlsx"}
    )

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)