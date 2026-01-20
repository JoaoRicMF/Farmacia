import logging
import pandas as pd
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func, extract, case
from models import db, Usuario, Financeiro, Log, EntradaCaixa, SaidaCaixa

logger = logging.getLogger(__name__)

# --- SEGURANÇA E USUÁRIOS ---
def gerar_hash_senha(senha: str) -> str:
    return generate_password_hash(senha)

def verificar_login(usuario_login: str, senha: str) -> tuple | None:
    try:
        user = Usuario.query.filter_by(usuario=usuario_login).first()
        if user and check_password_hash(user.senha, senha):
            return (user.id, user.nome, user.funcao)
        return None
    except Exception as e:
        logger.error(f"Erro login: {e}", exc_info=True)
        return None

def criar_usuario_inicial():
    try:
        if Usuario.query.count() == 0:
            senha_hash = gerar_hash_senha("admin123")
            admin = Usuario(usuario='admin', senha=senha_hash, nome='Administrador', funcao='Admin')
            db.session.add(admin)
            db.session.commit()
            logger.warning("⚠️ Usuário 'admin' criado.")
    except Exception:
        pass # Tabelas podem não existir ainda na primeira execução

def obter_dados_usuario(nome_exibicao: str):
    user = Usuario.query.filter_by(nome=nome_exibicao).first()
    return (user.usuario, user.nome) if user else None

def atualizar_perfil_usuario(nome_atual: str, novo_login: str, novo_nome: str):
    user = Usuario.query.filter_by(nome=nome_atual).first()
    if user:
        user.usuario = novo_login
        user.nome = novo_nome
        db.session.commit()
        registrar_log(novo_nome, "Perfil", "Atualizou dados de perfil")

def alterar_senha_usuario(usuario_nome: str, nova_senha: str):
    user = Usuario.query.filter_by(nome=usuario_nome).first()
    if user:
        user.senha = gerar_hash_senha(nova_senha)
        db.session.commit()
        registrar_log(usuario_nome, "Segurança", "Alterou a senha")

# --- AUDITORIA ---
def registrar_log(usuario_nome: str, acao: str, detalhes: str = ""):
    try:
        novo_log = Log(
            data_hora=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            usuario=usuario_nome,
            acao=acao,
            detalhes=detalhes
        )
        db.session.add(novo_log)
        db.session.commit()
    except Exception as e:
        logger.error(f"Erro log: {e}")

def obter_logs() -> pd.DataFrame:
    query = Log.query.order_by(Log.id.desc()).limit(100).statement
    return pd.read_sql(query, db.session.connection())

# --- INICIALIZAÇÃO ---
def init_db(app):
    # Com Flask-Migrate, init_db serve apenas para seed inicial se necessário
    with app.app_context():
        # Cria tabelas se não existirem (fallback se não usar migrate init)
        db.create_all()
        criar_usuario_inicial()

# --- LEITURA (Usando Pandas com SQL Alchemy ORM Statement) ---
def listar_registros(busca=None, status_filtro="Todos", categoria_filtro="Todas", limit=None, offset=0) -> pd.DataFrame:
    try:
        query = Financeiro.query

        # Filtros
        if busca:
            query = query.filter(Financeiro.descricao.like(f"%{busca}%"))

        if status_filtro and status_filtro != "Todos":
            query = query.filter_by(status=status_filtro)

        if categoria_filtro and categoria_filtro != "Todas":
            query = query.filter_by(categoria=categoria_filtro)

        # Ordenação
        query = query.order_by(Financeiro.id.desc())

        # Paginação
        if limit:
            query = query.limit(limit).offset(offset)

        # Usamos db.session.connection() para garantir compatibilidade com o Pandas novo
        return pd.read_sql(query.statement, db.session.connection())

    except Exception as e:
        # Log do erro no terminal para facilitar o debug
        print(f"Erro em listar_registros: {e}")
        return pd.DataFrame()

def contar_registros_filtro(busca=None, status_filtro="Todos", categoria_filtro="Todas") -> int:
    query = Financeiro.query
    if busca: query = query.filter(Financeiro.descricao.like(f"%{busca}%"))
    if status_filtro != "Todos": query = query.filter_by(status=status_filtro)
    if categoria_filtro != "Todas": query = query.filter_by(categoria=categoria_filtro)
    return query.count()

def verificar_existencia_boleto(codigo: str) -> bool:
    if not codigo: return False
    return db.session.query(Financeiro.id).filter_by(codigo_barras=codigo).first() is not None

# --- ESCRITA ---
def adicionar_registro(usuario_log, data_proc, descricao, valor, codigo_barras, vencimento, status, categoria):
    novo = Financeiro(
        data_processamento=data_proc, descricao=descricao, valor=valor,
        codigo_barras=codigo_barras, vencimento=vencimento, status=status, categoria=categoria
    )
    db.session.add(novo)
    db.session.commit()
    registrar_log(usuario_log, "Novo Lançamento", f"R$ {valor} - {descricao}")

def editar_registro(usuario_log, id_reg, descricao, valor, vencimento, categoria, status):
    reg = Financeiro.query.get(id_reg)
    if reg:
        detalhe = f"De: {reg.descricao} ({reg.valor}) Para: {descricao} ({valor})"
        reg.descricao = descricao
        reg.valor = valor
        reg.vencimento = vencimento
        reg.categoria = categoria
        reg.status = status
        db.session.commit()
        registrar_log(usuario_log, "Edição", detalhe)

def atualizar_status(usuario_log, id_reg, novo_status):
    reg = Financeiro.query.get(id_reg)
    if reg:
        old_desc = reg.descricao
        reg.status = novo_status
        db.session.commit()
        registrar_log(usuario_log, "Alteração Status", f"{old_desc} -> {novo_status}")

def excluir_registro(usuario_log, id_reg):
    reg = Financeiro.query.get(id_reg)
    if reg:
        detalhe = f"{reg.descricao} (R$ {reg.valor})"
        db.session.delete(reg)
        db.session.commit()
        registrar_log(usuario_log, "Exclusão", f"Apagou: {detalhe}")

# --- CAIXA ---
def adicionar_entrada(usuario, valor, forma_pagamento, data_iso):
    nova = EntradaCaixa(data_registro=data_iso, valor=valor, forma_pagamento=forma_pagamento, usuario=usuario)
    db.session.add(nova)
    db.session.commit()
    registrar_log(usuario, "Entrada Caixa", f"R$ {valor} ({forma_pagamento})")

def excluir_entrada(usuario, id_entrada):
    reg = EntradaCaixa.query.get(id_entrada)
    if reg:
        db.session.delete(reg)
        db.session.commit()
        registrar_log(usuario, "Exclusão Caixa", f"Removeu entrada ID {id_entrada}")

def adicionar_saida_caixa(usuario, descricao, valor, forma_pagamento, data_iso):
    nova = SaidaCaixa(data_registro=data_iso, descricao=descricao, valor=valor, forma_pagamento=forma_pagamento, usuario=usuario)
    db.session.add(nova)
    db.session.commit()
    registrar_log(usuario, "Saída Caixa", f"R$ {valor} - {descricao}")

def excluir_saida_caixa(usuario, id_saida):
    reg = SaidaCaixa.query.get(id_saida)
    if reg:
        db.session.delete(reg)
        db.session.commit()
        registrar_log(usuario, "Exclusão Caixa", f"Removeu saída ID {id_saida}")

# --- FLUXO (Query Complexa convertida para ORM/Pandas) ---
def obter_resumo_fluxo(mes=None, ano=None):
    if not mes or not ano:
        hoje = datetime.now()
        mes, ano = f"{hoje.month:02d}", str(hoje.year)
    filtro_data = f"{ano}-{mes}%"

    resumo = {'entradas_total': 0.0, 'entradas_dinheiro': 0.0, 'entradas_pix': 0.0,
              'entradas_cartao': 0.0, 'saidas_total': 0.0, 'saldo': 0.0, 'extrato': []}

    try:
        # --- CORREÇÃO: Sintaxe do case() atualizada ---
        entradas_q = db.session.query(
            func.sum(EntradaCaixa.valor).label('total'),
            func.sum(case((EntradaCaixa.forma_pagamento == 'Dinheiro', EntradaCaixa.valor), else_=0)).label('dinheiro'),
            func.sum(case((EntradaCaixa.forma_pagamento == 'Pix', EntradaCaixa.valor), else_=0)).label('pix'),
            func.sum(case((EntradaCaixa.forma_pagamento == 'Cartão', EntradaCaixa.valor), else_=0)).label('cartao')
        ).filter(EntradaCaixa.data_registro.like(filtro_data)).first()

        if entradas_q and entradas_q.total:
            resumo['entradas_total'] = float(entradas_q.total or 0)
            resumo['entradas_dinheiro'] = float(entradas_q.dinheiro or 0)
            resumo['entradas_pix'] = float(entradas_q.pix or 0)
            resumo['entradas_cartao'] = float(entradas_q.cartao or 0)

        # Saidas Caixa
        saidas_caixa_total = db.session.query(func.sum(SaidaCaixa.valor)) \
                                 .filter(SaidaCaixa.data_registro.like(filtro_data)).scalar() or 0.0
        resumo['saidas_total'] += float(saidas_caixa_total)

        # Boletos Pagos (Lógica mantida)
        boletos_total = db.session.query(func.sum(Financeiro.valor)) \
                            .filter(Financeiro.status == 'Pago') \
                            .filter(func.substr(Financeiro.vencimento, 7, 4) == ano) \
                            .filter(func.substr(Financeiro.vencimento, 4, 2) == mes).scalar() or 0.0
        resumo['saidas_total'] += float(boletos_total)

        # Preencher Extrato (Entradas)
        entradas = EntradaCaixa.query.filter(EntradaCaixa.data_registro.like(filtro_data)).order_by(EntradaCaixa.data_registro.desc()).all()
        for e in entradas:
            resumo['extrato'].append({
                'data': e.data_registro,
                'descricao': 'Entrada Avulsa',
                'valor': e.valor,
                'tipo': 'entrada',
                'categoria': e.forma_pagamento,
                'id': e.id
            })

        # Preencher Extrato (Saídas Caixa)
        saidas = SaidaCaixa.query.filter(SaidaCaixa.data_registro.like(filtro_data)).order_by(SaidaCaixa.data_registro.desc()).all()
        for s in saidas:
            resumo['extrato'].append({
                'data': s.data_registro,
                'descricao': s.descricao or 'Saída Avulsa',
                'valor': s.valor,
                'tipo': 'saida_caixa',
                'categoria': s.forma_pagamento,
                'id': s.id
            })

        # Preencher Extrato (Boletos)
        boletos = Financeiro.query.filter(Financeiro.status == 'Pago') \
            .filter(func.substr(Financeiro.vencimento, 7, 4) == ano) \
            .filter(func.substr(Financeiro.vencimento, 4, 2) == mes).all()

        for b in boletos:
            try:
                dt_obj = datetime.strptime(b.vencimento, '%d/%m/%Y')
                data_fmt = dt_obj.strftime('%Y-%m-%d')
            except:
                data_fmt = b.vencimento
            resumo['extrato'].append({
                'data': data_fmt,
                'descricao': b.descricao,
                'valor': b.valor,
                'tipo': 'saida_boleto',
                'categoria': 'Conta Paga',
                'id': 0
            })

        # Ordenação final e saldo
        resumo['extrato'].sort(key=lambda x: x['data'], reverse=True)
        resumo['saldo'] = resumo['entradas_total'] - resumo['saidas_total']

    except Exception as e:
        print(f"Erro no Fluxo: {e}") # Log no terminal para debug
        return resumo # Retorna vazio em caso de erro para não travar o front

    return resumo