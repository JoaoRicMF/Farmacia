from flask import Flask, render_template, request, jsonify, session
import database_manager as db
from datetime import datetime, timedelta
import pandas as pd
import os

app = Flask(__name__, template_folder='templates')
app.secret_key = 'chave_secreta_super_segura_farmacia'

db.init_db()

# --- AUXILIAR: Decifrar Boleto ---
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

# --- ROTAS ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = db.verificar_login(data.get('usuario'), data.get('senha'))
    if user:
        session['usuario'] = user[1]
        return jsonify({'success': True, 'nome': user[1]})
    return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('usuario', None)
    return jsonify({'success': True})

@app.route('/api/registros', methods=['GET'])
def listar():
    if 'usuario' not in session: return jsonify([]), 403

    # Parâmetros da URL
    busca = request.args.get('busca', '')
    status = request.args.get('status', 'Todos')
    cat = request.args.get('categoria', 'Todas')
    pagina = int(request.args.get('pagina', 1))
    itens_por_pag = 10

    offset = (pagina - 1) * itens_por_pag

    # Busca dados
    df = db.listar_registros(busca, status, cat, limit=itens_por_pag, offset=offset)
    total_itens = db.contar_registros_filtro(busca, status, cat)

    total_paginas = (total_itens // itens_por_pag) + (1 if total_itens % itens_por_pag > 0 else 0)

    return jsonify({
        'registros': df.to_dict(orient='records'),
        'total_paginas': total_paginas,
        'pagina_atual': pagina
    })

@app.route('/api/editar', methods=['POST'])
def editar():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    try:
        # Tenta formatar data se vier ISO
        try:
            data_fmt = datetime.strptime(d['vencimento'], '%Y-%m-%d').strftime('%d/%m/%Y')
        except:
            data_fmt = d['vencimento']

        db.editar_registro(
            session['usuario'], d['id'], d['descricao'],
            float(d['valor']), data_fmt, d['categoria'], d['status']
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/dashboard', methods=['GET'])
def dashboard_data():
    if 'usuario' not in session: return jsonify({}), 403

    df_tempo = db.obter_dados_grafico_tempo()
    df_cat = db.obter_dados_grafico_categoria()

    df = db.listar_registros()

    hoje = datetime.now()
    mes_atual = hoje.month
    ano_atual = hoje.year

    if not df.empty:
        df['dt_venc'] = pd.to_datetime(df['vencimento'], format='%d/%m/%Y', errors='coerce')

        mask_mes = (df['dt_venc'].dt.month == mes_atual) & (df['dt_venc'].dt.year == ano_atual)
        mask_vencidos = (df['dt_venc'] < hoje) & (df['status'] == 'Pendente')
        # Ajuste para pegar apenas a data (sem hora) para comparação correta de "hoje"
        mask_proximos = (df['dt_venc'] >= pd.Timestamp(hoje.date())) & (df['dt_venc'] <= pd.Timestamp(hoje.date()) + timedelta(days=7)) & (df['status'] == 'Pendente')

        total_pagar_mes = df[mask_mes & (df['status'] == 'Pendente')]['valor'].sum()
        total_pago_mes = df[mask_mes & (df['status'] == 'Pago')]['valor'].sum()

        vencidos_valor = df[mask_vencidos]['valor'].sum()
        vencidos_qtd = int(df[mask_vencidos].shape[0])

        proximos_qtd = int(df[mask_proximos].shape[0])
        proximos_valor = df[mask_proximos]['valor'].sum()
    else:
        total_pagar_mes = 0.0
        total_pago_mes = 0.0
        vencidos_valor = 0.0
        vencidos_qtd = 0
        proximos_qtd = 0
        proximos_valor = 0.0

    return jsonify({
        'graficos': {
            'por_mes': df_tempo.to_dict(orient='records'),
            'por_categoria': df_cat.to_dict(orient='records')
        },
        'cards': {
            'pagar_mes': total_pagar_mes,
            'pago_mes': total_pago_mes,
            'vencidos_val': vencidos_valor,
            'vencidos_qtd': vencidos_qtd,
            'proximos_qtd': proximos_qtd,
            'proximos_val': proximos_valor
        }
    })

# --- NOVA ROTA: DETALHES DO CARD ---
@app.route('/api/detalhes_card', methods=['POST'])
def detalhes_card():
    if 'usuario' not in session: return jsonify([]), 403
    tipo = request.json.get('tipo')

    df = db.listar_registros()
    if df.empty: return jsonify([])

    hoje = datetime.now()
    mes_atual = hoje.month
    ano_atual = hoje.year
    df['dt_venc'] = pd.to_datetime(df['vencimento'], format='%d/%m/%Y', errors='coerce')

    filtrado = pd.DataFrame()

    if tipo == 'pagar_mes':
        mask = (df['dt_venc'].dt.month == mes_atual) & (df['dt_venc'].dt.year == ano_atual) & (df['status'] == 'Pendente')
        filtrado = df[mask]
    elif tipo == 'vencidos':
        mask = (df['dt_venc'] < hoje) & (df['status'] == 'Pendente')
        filtrado = df[mask]
    elif tipo == 'proximos':
        # Compara apenas datas para incluir o dia de hoje corretamente
        mask = (df['dt_venc'] >= pd.Timestamp(hoje.date())) & (df['dt_venc'] <= pd.Timestamp(hoje.date()) + timedelta(days=7)) & (df['status'] == 'Pendente')
        filtrado = df[mask]
    elif tipo == 'pago_mes':
        mask = (df['dt_venc'].dt.month == mes_atual) & (df['dt_venc'].dt.year == ano_atual) & (df['status'] == 'Pago')
        filtrado = df[mask]

    # Remove a coluna auxiliar de data antes de enviar
    if 'dt_venc' in filtrado.columns:
        del filtrado['dt_venc']

    return jsonify(filtrado.fillna('').to_dict(orient='records'))

@app.route('/api/novo_boleto', methods=['POST'])
def adicionar():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    try:
        data_fmt = datetime.strptime(d['vencimento'], '%Y-%m-%d').strftime('%d/%m/%Y')
    except: data_fmt = d['vencimento']

    if db.verificar_existencia_boleto(d['codigo']):
        return jsonify({'success': False, 'message': 'Boleto duplicado'})

    db.adicionar_registro(session['usuario'], datetime.now().strftime('%d/%m/%Y'),
                          d['descricao'], float(d['valor']), d['codigo'], data_fmt, d['status'], d['categoria'])
    return jsonify({'success': True})
@app.route('/api/atualizar_status', methods=['POST'])
def atualizar_status():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    db.atualizar_status(session['usuario'], d['id'], d['status'])
    return jsonify({'success': True})

@app.route('/api/excluir', methods=['POST'])
def excluir():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    db.excluir_registro(session['usuario'], d['id'])
    return jsonify({'success': True})

@app.route('/api/ler_codigo', methods=['POST'])
def ler_codigo():
    codigo = request.json.get('codigo')
    venc, val, tipo = decifrar_boleto(codigo)
    return jsonify({'vencimento': venc, 'valor': val, 'tipo': tipo})

@app.route('/api/dados_usuario', methods=['GET'])
def dados_usuario():
    if 'usuario' not in session: return jsonify({}), 403
    dados = db.obter_dados_usuario(session['usuario'])
    return jsonify({'login': dados[0], 'nome': dados[1]})

@app.route('/api/alterar_perfil', methods=['POST'])
def alterar_perfil():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json
    try:
        if d.get('novo_login') and d.get('novo_nome'):
            db.atualizar_perfil_usuario(session['usuario'], d['novo_login'], d['novo_nome'])
            session['usuario'] = d['novo_nome']
        if d.get('nova_senha'):
            db.alterar_senha_usuario(session['usuario'], d['nova_senha'])
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'message': str(e)})

if __name__ == '__main__':
    app.run(debug=True, port=5000)