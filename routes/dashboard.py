from flask import Blueprint, request, jsonify, session
import database_manager as db
from services import analytics

bp = Blueprint('dashboard', __name__)

@bp.route('/api/dashboard', methods=['GET'])
def dashboard_data():
    if 'usuario' not in session: return jsonify({}), 403

    periodo = request.args.get('periodo', '7d')
    df = db.listar_registros() # Pega dados brutos

    # Usa o serviço de analytics para processar
    cards = analytics.calcular_cards_dashboard(df)
    graficos = analytics.gerar_dados_graficos(df, periodo)

    return jsonify({
        'graficos': graficos,
        'cards': cards
    })

@bp.route('/api/detalhes_card', methods=['POST'])
def detalhes():
    if 'usuario' not in session: return jsonify([]), 403
    tipo = request.json.get('tipo', '')

    df = db.listar_registros()
    filtrado = analytics.filtrar_dados_detalhes(df, tipo)

    return jsonify(filtrado.to_dict(orient='records'))

@bp.route('/api/calendario', methods=['GET'])
def calendario():
    if 'usuario' not in session: return jsonify([]), 403

    df = db.listar_registros()
    eventos = analytics.gerar_eventos_calendario(df)

    return jsonify(eventos)