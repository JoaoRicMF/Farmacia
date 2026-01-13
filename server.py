from flask import Flask, render_template, request, jsonify, session
import database_manager as db
from datetime import datetime, timedelta
import os

app = Flask(__name__, template_folder='templates')
app.secret_key = 'chave_secreta_super_segura_farmacia'  # Troque em produção

# Inicializa o banco ao arrancar
db.init_db()


# --- LÓGICA DE BOLETO (Trazida do seu app.py original) ---
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
            return venc.strftime('%Y-%m-%d'), int(val_str) / 100.0, "Bancário"
    except:
        return None, 0.0, "Erro"


# --- ROTAS DA API ---

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = db.verificar_login(data.get('usuario'), data.get('senha'))
    if user:
        session['usuario'] = user[1]  # Nome real
        return jsonify({'success': True, 'nome': user[1]})
    return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401


@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('usuario', None)
    return jsonify({'success': True})


@app.route('/api/registros', methods=['GET'])
def listar():
    if 'usuario' not in session: return jsonify([]), 403

    # Filtros simples (pode expandir conforme necessário)
    df = db.listar_registros()
    registros = df.to_dict(orient='records')
    return jsonify(registros)


@app.route('/api/dashboard', methods=['GET'])
def dashboard_data():
    if 'usuario' not in session: return jsonify({}), 403

    df_tempo = db.obter_dados_grafico_tempo()
    df_cat = db.obter_dados_grafico_categoria()

    return jsonify({
        'por_mes': df_tempo.to_dict(orient='records'),
        'por_categoria': df_cat.to_dict(orient='records')
    })


@app.route('/api/novo_boleto', methods=['POST'])
def adicionar():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json

    # Tratamento de data para o formato DD/MM/YYYY que o banco espera
    try:
        data_obj = datetime.strptime(d['vencimento'], '%Y-%m-%d')
        data_fmt = data_obj.strftime('%d/%m/%Y')
    except:
        data_fmt = d['vencimento']

    if db.verificar_existencia_boleto(d['codigo']):
        return jsonify({'success': False, 'message': 'Boleto duplicado'})

    db.adicionar_registro(
        session['usuario'],
        datetime.now().strftime('%d/%m/%Y'),
        d['descricao'],
        float(d['valor']),
        d['codigo'],
        data_fmt,
        d['status'],
        d['categoria']
    )
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


@app.route('/api/alterar_perfil', methods=['POST'])
def alterar_perfil():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json

    try:
        # Atualiza Nome e Login
        if d.get('novo_login') and d.get('novo_nome'):
            db.atualizar_perfil_usuario(session['usuario'], d['novo_login'], d['novo_nome'])
            # Atualiza a sessão com o novo nome
            session['usuario'] = d['novo_nome']

        # Atualiza Senha (se fornecida)
        if d.get('nova_senha'):
            db.alterar_senha_usuario(session['usuario'], d['nova_senha'])

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/dados_usuario', methods=['GET'])
def dados_usuario():
    if 'usuario' not in session: return jsonify({}), 403
    # Busca dados atuais para preencher o formulário
    dados = db.obter_dados_usuario(session['usuario'])
    return jsonify({'login': dados[0], 'nome': dados[1]})

if __name__ == '__main__':
    app.run(debug=True, port=5000)