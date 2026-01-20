from flask import Blueprint, request, jsonify, session
import database_manager as db
import logging

bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)

@bp.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    user = db.verificar_login(data.get('usuario'), data.get('senha'))
    if user:
        session['usuario'] = user[1]
        session['funcao'] = user[2]
        logger.info(f"Login efetuado: {user[1]}")
        return jsonify({'success': True, 'nome': user[1], 'funcao': user[2]})

    logger.warning(f"Login falho: {data.get('usuario')}")
    return jsonify({'success': False, 'message': 'Credenciais inválidas'}), 401

@bp.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@bp.route('/api/dados_usuario', methods=['GET'])
def dados_usuario():
    if 'usuario' not in session: return jsonify({})
    d = db.obter_dados_usuario(session['usuario'])
    if d:
        return jsonify({'login': d[0], 'nome': d[1]})
    return jsonify({})

@bp.route('/api/alterar_perfil', methods=['POST'])
def alterar_perfil():
    if 'usuario' not in session: return jsonify({'success': False}), 403
    d = request.json or {}
    if d.get('nova_senha'):
        db.alterar_senha_usuario(session['usuario'], d['nova_senha'])
    if d.get('novo_nome'):
        db.atualizar_perfil_usuario(session['usuario'], d['novo_login'], d['novo_nome'])
        session['usuario'] = d['novo_nome']
    return jsonify({'success': True})

@bp.route('/api/logs', methods=['GET'])
def logs():
    if 'usuario' not in session: return jsonify([]), 403
    if session.get('funcao') != 'Admin': return jsonify([]), 403 # Segurança extra
    return jsonify(db.obter_logs().to_dict(orient='records'))