from flask import Blueprint, request, jsonify, session, Response
import database_manager as db
import pandas as pd
import io
import logging
from datetime import datetime
from services.utils import decifrar_boleto

bp = Blueprint('financeiro', __name__)
logger = logging.getLogger(__name__)

# --- CRUD REGISTROS ---
@bp.route('/api/registros', methods=['GET'])
def listar():
    if 'usuario' not in session: return jsonify([]), 403
    try:
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
    except ValueError:
        return jsonify({'registros': [], 'total_paginas': 1}), 400

@bp.route('/api/novo_boleto', methods=['POST'])
def add():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json or {}

    db.adicionar_registro(
        session['usuario'],
        d['descricao'],
        float(d['valor']),
        d['codigo'],
        d['vencimento'], # Passa YYYY-MM-DD
        d['status'],
        d['categoria']
    )

@bp.route('/api/editar', methods=['POST'])
def edit():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json or {}
    db.editar_registro(session['usuario'], d['id'], d['descricao'], float(d['valor']), d['vencimento'], d['categoria'], d['status'])
    return jsonify({'success': True})

@bp.route('/api/atualizar_status', methods=['POST'])
def status_up():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json or {}
    db.atualizar_status(session['usuario'], d['id'], d['status'])
    return jsonify({'success': True})

@bp.route('/api/excluir', methods=['POST'])
def delete():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin': return jsonify({'success': False, 'message': 'Apenas Admins podem excluir.'}), 403
    d = request.json or {}
    db.excluir_registro(session['usuario'], d['id'])
    return jsonify({'success': True})

@bp.route('/api/ler_codigo', methods=['POST'])
def ler():
    d = request.json or {}
    v, val, t = decifrar_boleto(d.get('codigo'))
    return jsonify({'vencimento': v, 'valor': val, 'tipo': t})

# --- FLUXO DE CAIXA ---
@bp.route('/api/fluxo_resumo', methods=['GET'])
def api_fluxo():
    if 'usuario' not in session: return jsonify({}), 403
    mes = request.args.get('mes')
    ano = request.args.get('ano')
    dados = db.obter_resumo_fluxo(mes, ano)
    return jsonify(dados)

@bp.route('/api/nova_entrada', methods=['POST'])
def nova_entrada():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json or {}
    try:
        valor = float(d['valor'])
        db.adicionar_entrada(session['usuario'], valor, d['forma'], d['data'])
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Erro nova entrada: {e}", exc_info=True)
        return jsonify({'success': False}), 500

@bp.route('/api/nova_saida_caixa', methods=['POST'])
def nova_saida_caixa():
    if 'usuario' not in session: return jsonify({}), 403
    d = request.json or {}
    try:
        valor = float(d['valor'])
        db.adicionar_saida_caixa(session['usuario'], d['descricao'], valor, d['forma'], d['data'])
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Erro nova saida: {e}", exc_info=True)
        return jsonify({'success': False}), 500

@bp.route('/api/excluir_entrada', methods=['POST'])
def excluir_entrada_route():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin': return jsonify({'success': False}), 403
    d = request.json or {}
    db.excluir_entrada(session['usuario'], d['id'])
    return jsonify({'success': True})

@bp.route('/api/excluir_saida_caixa', methods=['POST'])
def excluir_saida_caixa():
    if 'usuario' not in session: return jsonify({}), 403
    if session.get('funcao') != 'Admin': return jsonify({'success': False}), 403
    d = request.json or {}
    db.excluir_saida_caixa(session['usuario'], d['id'])
    return jsonify({'success': True})

# --- EXPORTAÇÃO ---
@bp.route('/api/exportar', methods=['GET'])
def exportar():
    if 'usuario' not in session: return "", 403
    df = db.listar_registros()
    out = io.StringIO()
    df.to_csv(out, index=False, sep=';', encoding='utf-8-sig')
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-disposition": "attachment; filename=dados.csv"})

@bp.route('/api/exportar_fluxo_excel', methods=['GET'])
def exportar_fluxo_excel():
    if 'usuario' not in session: return "", 403
    mes = request.args.get('mes')
    ano = request.args.get('ano')
    dados = db.obter_resumo_fluxo(mes, ano)
    extrato = dados['extrato']
    if not extrato: return "Sem dados.", 404

    df = pd.DataFrame(extrato)
    df_export = df[['data', 'descricao', 'categoria', 'tipo', 'valor']].copy()

    out = io.BytesIO()
    with pd.ExcelWriter(out, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name=f'Fluxo {mes}-{ano}')
    out.seek(0)
    return Response(out.getvalue(), mimetype='application/vnd.openxmlformats', headers={"Content-Disposition": "attachment;filename=fluxo.xlsx"})