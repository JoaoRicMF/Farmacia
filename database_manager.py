import logging
import pandas as pd
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func, extract, case
from models import db, Usuario, Financeiro, Log, EntradaCaixa, SaidaCaixa, Fornecedor

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

def criar_novo_usuario(admin_log, novo_usuario, senha, nome, funcao):
    """Cria um novo usuário no sistema se o login não existir."""
    try:
        # Verifica duplicidade
        if Usuario.query.filter_by(usuario=novo_usuario).first():
            return False, "Nome de usuário (login) já existe."

        senha_hash = gerar_hash_senha(senha)
        novo = Usuario(usuario=novo_usuario, senha=senha_hash, nome=nome, funcao=funcao)
        db.session.add(novo)
        db.session.commit()

        registrar_log(admin_log, "Gestão Usuários", f"Criou usuário: {novo_usuario} ({funcao})")
        return True, "Usuário criado com sucesso!"
    except Exception as e:
        logger.error(f"Erro ao criar usuário: {e}")
        return False, "Erro interno ao criar usuário."

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

def listar_usuarios():
    """Retorna uma lista de dicionários com dados básicos dos usuários."""
    try:
        users = Usuario.query.order_by(Usuario.nome).all()
        return [{'id': u.id, 'nome': u.nome, 'usuario': u.usuario, 'funcao': u.funcao} for u in users]
    except Exception as e:
        logger.error(f"Erro ao listar usuários: {e}")
        return []

def admin_resetar_senha(admin_log, user_id, nova_senha):
    """Permite que um Admin resete a senha de outro usuário pelo ID."""
    try:
        user = Usuario.query.get(user_id)
        if user:
            user.senha = gerar_hash_senha(nova_senha)
            db.session.commit()
            registrar_log(admin_log, "Segurança", f"Resetou senha do usuário: {user.usuario}")
            return True, "Senha alterada com sucesso."
        return False, "Usuário não encontrado."
    except Exception as e:
        logger.error(f"Erro ao resetar senha: {e}")
        return False, "Erro interno ao resetar senha."

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
def adicionar_registro(usuario_log, descricao, valor, codigo_barras, vencimento_str, status, categoria):
    # Converte string ISO (YYYY-MM-DD) para objeto date
    try:
        vencimento_obj = datetime.strptime(vencimento_str, '%Y-%m-%d').date() if vencimento_str else None
    except ValueError:
        vencimento_obj = None # Ou lidar com erro

    novo = Financeiro(
        data_processamento=datetime.now(), # Agora é automático/objeto
        descricao=descricao,
        valor=valor,
        codigo_barras=codigo_barras,
        vencimento=vencimento_obj, # Passa o objeto date
        status=status,
        categoria=categoria
    )
    db.session.add(novo)
    db.session.commit()
    registrar_log(usuario_log, "Novo Lançamento", f"R$ {valor} - {descricao}")

def editar_registro(usuario_log, id_reg, descricao, valor, vencimento_str, categoria, status):
    reg = Financeiro.query.get(id_reg)
    if reg:
        # Converte string para objeto
        try:
            vencimento_obj = datetime.strptime(vencimento_str, '%Y-%m-%d').date() if vencimento_str else None
        except:
            vencimento_obj = reg.vencimento

        detalhe = f"De: {reg.descricao} ({reg.valor}) Para: {descricao} ({valor})"
        reg.descricao = descricao
        reg.valor = valor
        reg.vencimento = vencimento_obj
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
    # data_iso vem do front como 'YYYY-MM-DD'
    data_obj = datetime.strptime(data_iso, '%Y-%m-%d').date()
    nova = EntradaCaixa(data_registro=data_obj, valor=valor, forma_pagamento=forma_pagamento, usuario=usuario)
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

        # --- GESTÃO DE FORNECEDORES ---
def listar_fornecedores():
    try:
        # Retorna lista de objetos ordenados por nome
        return Fornecedor.query.order_by(Fornecedor.nome).all()
    except Exception as e:
        print(f"Erro ao listar fornecedores: {e}")
        return []

def adicionar_fornecedor(usuario_log, nome, categoria):
    try:
        # Verifica se já existe (case insensitive opcional, aqui exato)
        if Fornecedor.query.filter_by(nome=nome).first():
            return False, "Fornecedor já cadastrado."

        novo = Fornecedor(
            nome=nome,
            categoria_padrao=categoria,
            usuario_criacao=usuario_log
        )
        db.session.add(novo)
        db.session.commit()

        registrar_log(usuario_log, "Configuração", f"Cadastrou fornecedor: {nome}")
        return True, "Sucesso"
    except Exception as e:
        return False, f"Erro: {str(e)}"

def excluir_fornecedor(usuario_log, id_forn):
    try:
        f = Fornecedor.query.get(id_forn)
        if f:
            nome = f.nome
            db.session.delete(f)
            db.session.commit()
            registrar_log(usuario_log, "Configuração", f"Removeu fornecedor: {nome}")
    except Exception as e:
        print(f"Erro ao excluir fornecedor: {e}")

# --- FLUXO (Query Complexa convertida para ORM/Pandas) ---
def obter_resumo_fluxo(mes=None, ano=None):
    if not mes or not ano:
        hoje = datetime.now()
        mes, ano = hoje.month, hoje.year
    else:
        mes, ano = int(mes), int(ano)

    resumo = {'entradas_total': 0.0, 'entradas_dinheiro': 0.0, 'entradas_pix': 0.0,
              'entradas_cartao': 0.0, 'saidas_total': 0.0, 'saldo': 0.0, 'extrato': []}

    try:
        # Entradas
        entradas_q = db.session.query(
            func.sum(EntradaCaixa.valor).label('total'),
            # ... (seus sum/case mantêm-se iguais) ...
        ).filter(extract('year', EntradaCaixa.data_registro) == ano) \
            .filter(extract('month', EntradaCaixa.data_registro) == mes).first()

        # ... (preenchimento do dict resumo igual) ...

        # Saidas Caixa
        saidas_caixa_total = db.session.query(func.sum(SaidaCaixa.valor)) \
                                 .filter(extract('year', SaidaCaixa.data_registro) == ano) \
                                 .filter(extract('month', SaidaCaixa.data_registro) == mes).scalar() or 0.0

        # Boletos Pagos (Financeiro)
        # Atenção: Aqui mudamos a lógica do substr para extract
        boletos_total = db.session.query(func.sum(Financeiro.valor)) \
                            .filter(Financeiro.status == 'Pago') \
                            .filter(extract('year', Financeiro.vencimento) == ano) \
                            .filter(extract('month', Financeiro.vencimento) == mes).scalar() or 0.0

        # ... (cálculo de totais igual) ...

        # Extratos (Query objects, não strings)
        entradas = EntradaCaixa.query.filter(extract('year', EntradaCaixa.data_registro) == ano) \
            .filter(extract('month', EntradaCaixa.data_registro) == mes).all()

        # Ao iterar para o extrato, converta o objeto date para string BR para exibir
        for e in entradas:
            resumo['extrato'].append({
                'data': e.data_registro.strftime('%d/%m/%Y'), # Conversão na saída
                'descricao': 'Entrada Avulsa',
                'valor': e.valor,
                'tipo': 'entrada',
                'categoria': e.forma_pagamento,
                'id': e.id
            })

        # Preencher Extrato (Saídas Caixa)
        saidas = SaidaCaixa.query.filter(extract('year', SaidaCaixa.data_registro) == ano) \
            .filter(extract('month', SaidaCaixa.data_registro) == mes) \
            .order_by(SaidaCaixa.data_registro.desc()).all()

        for s in saidas:
            resumo['extrato'].append({
                'data': s.data_registro.strftime('%d/%m/%Y'), # Formata data objeto
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
        import traceback
        traceback.print_exc()
        return resumo # Retorna vazio em caso de erro para não travar o front

    return resumo