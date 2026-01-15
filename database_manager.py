import os
import pandas as pd
from datetime import datetime
import hashlib
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError  # Importado para tratar erros específicos do Banco

# CONFIGURAÇÕES DE AMBIENTE
DATABASE_URL = os.getenv("DATABASE_URL")

DB_FOLDER = 'database'
DB_FILE = 'financeiro.db'
DB_PATH = os.path.join(DB_FOLDER, DB_FILE)

# Se não houver variável de ambiente, usa SQLite local (Desenvolvimento)
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{DB_PATH}"
else:
    # Correção para SQLAlchemy 1.4+ (Heroku/Render usam 'postgres://' antigo)
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

# --- SEGURANÇA E USUÁRIOS ---
def gerar_hash_senha(senha):
    return hashlib.sha256(senha.encode()).hexdigest()

def verificar_login(usuario, senha):
    """Retorna (id, nome, funcao) se login ok."""
    senha_hash = gerar_hash_senha(senha)
    with engine.connect() as conn:
        res = conn.execute(text("SELECT id, nome, funcao FROM usuarios WHERE usuario = :u AND senha = :s"),
                           {'u': usuario, 's': senha_hash}).fetchone()
        return res

def criar_usuario_inicial():
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM usuarios")).scalar()
        if count == 0:
            senha_padrao = gerar_hash_senha("admin123")
            conn.execute(text("INSERT INTO usuarios (usuario, senha, nome, funcao) VALUES (:u, :s, :n, :f)"),
                         {'u': 'admin', 's': senha_padrao, 'n': 'Administrador', 'f': 'Admin'})
            conn.commit()
            print("⚠️ Usuário 'admin' criado com senha 'admin123'.")

def obter_dados_usuario(nome_exibicao):
    with engine.connect() as conn:
        return conn.execute(text("SELECT usuario, nome FROM usuarios WHERE nome = :n"),
                            {'n': nome_exibicao}).fetchone()

def atualizar_perfil_usuario(nome_atual, novo_login, novo_nome):
    with engine.connect() as conn:
        conn.execute(text("UPDATE usuarios SET usuario = :u, nome = :n WHERE nome = :nome_ref"),
                     {'u': novo_login, 'n': novo_nome, 'nome_ref': nome_atual})
        conn.commit()
    registrar_log(novo_nome, "Perfil", "Atualizou dados de perfil")

def alterar_senha_usuario(usuario_nome, nova_senha):
    novo_hash = gerar_hash_senha(nova_senha)
    with engine.connect() as conn:
        conn.execute(text("UPDATE usuarios SET senha = :s WHERE nome = :n"),
                     {'s': novo_hash, 'n': usuario_nome})
        conn.commit()
    registrar_log(usuario_nome, "Segurança", "Alterou a senha")

# --- AUDITORIA (LOGS) ---
def registrar_log(usuario_nome, acao, detalhes=""):
    data_hora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO logs (data_hora, usuario, acao, detalhes) VALUES (:d, :u, :a, :det)"),
                     {'d': data_hora, 'u': usuario_nome, 'a': acao, 'det': detalhes})
        conn.commit()

def obter_logs():
    with engine.connect() as conn:
        return pd.read_sql(text("SELECT * FROM logs ORDER BY id DESC LIMIT 100"), conn)

# --- INICIALIZAÇÃO E BACKUP ---
def init_db():
    # Cria pasta local apenas se estiver usando SQLite
    if "sqlite" in DATABASE_URL and not os.path.exists(DB_FOLDER):
        os.makedirs(DB_FOLDER)

    # Define sintaxe de chave primária baseada no banco
    if "sqlite" in DATABASE_URL:
        pk_type = "INTEGER PRIMARY KEY AUTOINCREMENT"
    else:
        pk_type = "SERIAL PRIMARY KEY" # Sintaxe PostgreSQL

    # Criação das Tabelas
    with engine.connect() as conn:
        conn.execute(text(f'''
                          CREATE TABLE IF NOT EXISTS financeiro (
                                                                    id {pk_type},
                                                                    data_processamento TEXT,
                                                                    descricao TEXT,
                                                                    valor REAL,
                                                                    codigo_barras TEXT,
                                                                    vencimento TEXT,
                                                                    status TEXT,
                                                                    categoria TEXT DEFAULT 'Outros'
                          )
                          '''))
        conn.execute(text(f'''
                          CREATE TABLE IF NOT EXISTS usuarios (
                                                                  id {pk_type},
                                                                  usuario TEXT UNIQUE,
                                                                  senha TEXT,
                                                                  nome TEXT,
                                                                  funcao TEXT
                          )
                          '''))
        conn.execute(text(f'''
                          CREATE TABLE IF NOT EXISTS logs (
                                                              id {pk_type},
                                                              data_hora TEXT,
                                                              usuario TEXT,
                                                              acao TEXT,
                                                              detalhes TEXT
                          )
                          '''))
        conn.execute(text(f'''
                          CREATE TABLE IF NOT EXISTS entradas_caixa (
                                                                        id {pk_type},
                                                                        data_registro TEXT,
                                                                        descricao TEXT,
                                                                        valor REAL,
                                                                        forma_pagamento TEXT,
                                                                        usuario TEXT
                          )
                          '''))
        conn.execute(text(f'''
                          CREATE TABLE IF NOT EXISTS saidas_caixa (
                                                                      id {pk_type},
                                                                      data_registro TEXT,
                                                                      descricao TEXT, 
                                                                      valor REAL,
                                                                      forma_pagamento TEXT,
                                                                      usuario TEXT
                          )
                          '''))

        # Migrações e verificações de colunas existentes
        try:
            if "sqlite" in DATABASE_URL:
                cols = pd.read_sql(text("PRAGMA table_info(saidas_caixa)"), conn)['name'].tolist()
                if 'descricao' not in cols:
                    conn.execute(text("ALTER TABLE saidas_caixa ADD COLUMN descricao TEXT"))
        except SQLAlchemyError:
            # Ignora erro se a tabela não existir ou a coluna já existir (comum em migrações manuais)
            pass

        try:
            if "sqlite" in DATABASE_URL:
                cols = pd.read_sql(text("PRAGMA table_info(financeiro)"), conn)['name'].tolist()
                if 'categoria' not in cols:
                    conn.execute(text("ALTER TABLE financeiro ADD COLUMN categoria TEXT DEFAULT 'Outros'"))
        except SQLAlchemyError:
            pass

    criar_usuario_inicial()

# --- FUNÇÕES DE LEITURA ---
def listar_registros(busca=None, status_filtro="Todos", categoria_filtro="Todas", limit=None, offset=0):
    try:
        q = "SELECT * FROM financeiro WHERE 1=1"
        p = {}

        if busca:
            q += " AND descricao LIKE :b"
            p['b'] = f"%{busca}%"

        if status_filtro and status_filtro != "Todos":
            q += " AND status = :s"
            p['s'] = status_filtro

        if categoria_filtro and categoria_filtro != "Todas":
            q += " AND categoria = :c"
            p['c'] = categoria_filtro

        q += " ORDER BY id DESC"

        if limit:
            q += " LIMIT :lim OFFSET :off"
            p['lim'] = limit
            p['off'] = offset

        with engine.connect() as conn:
            return pd.read_sql(text(q), conn, params=p)

    except SQLAlchemyError as e:
        print(f"Erro de Banco de Dados ao listar: {e}")
        return pd.DataFrame()
    except Exception as e:
        # Mantém catch genérico apenas para erros não relacionados ao banco (ex: Pandas memory)
        print(f"Erro inesperado ao listar: {e}")
        return pd.DataFrame()

def contar_registros_filtro(busca=None, status_filtro="Todos", categoria_filtro="Todas"):
    q = "SELECT COUNT(*) FROM financeiro WHERE 1=1"
    p = {}
    if busca: q += " AND descricao LIKE :b"; p['b'] = f"%{busca}%"
    if status_filtro != "Todos": q += " AND status = :s"; p['s'] = status_filtro
    if categoria_filtro != "Todas": q += " AND categoria = :c"; p['c'] = categoria_filtro

    with engine.connect() as conn:
        return conn.execute(text(q), p).scalar()

def obter_dados_grafico_tempo():
    with engine.connect() as c:
        return pd.read_sql(text("SELECT substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) as mes, SUM(valor) as total FROM financeiro GROUP BY mes ORDER BY mes ASC"), c)

def obter_dados_grafico_categoria():
    with engine.connect() as c:
        return pd.read_sql(text("SELECT categoria, SUM(valor) as total FROM financeiro GROUP BY categoria ORDER BY total DESC"), c)

def verificar_existencia_boleto(codigo):
    if not codigo: return False
    with engine.connect() as c:
        return c.execute(text("SELECT id FROM financeiro WHERE codigo_barras = :c"), {'c': codigo}).fetchone() is not None

# --- FUNÇÕES DE ESCRITA (CRUD) ---
def adicionar_registro(usuario_log, data_proc, descricao, valor, codigo_barras, vencimento, status, categoria):
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO financeiro (data_processamento, descricao, valor, codigo_barras, vencimento, status, categoria) VALUES (:d, :desc, :val, :c, :v, :s, :cat)"),
                     {'d': data_proc, 'desc': descricao, 'val': valor, 'c': codigo_barras, 'v': vencimento, 's': status, 'cat': categoria})
        conn.commit()
    registrar_log(usuario_log, "Novo Lançamento", f"R$ {valor} - {descricao}")

def editar_registro(usuario_log, id_reg, descricao, valor, vencimento, categoria, status):
    with engine.connect() as conn:
        antigo = conn.execute(text("SELECT descricao, valor FROM financeiro WHERE id=:id"), {'id': id_reg}).fetchone()
        conn.execute(text("UPDATE financeiro SET descricao=:d, valor=:v, vencimento=:dt, categoria=:c, status=:s WHERE id=:id"),
                     {'d': descricao, 'v': valor, 'dt': vencimento, 'c': categoria, 's': status, 'id': id_reg})
        conn.commit()

    detalhe = f"De: {antigo[0]} ({antigo[1]}) Para: {descricao} ({valor})" if antigo else ""
    registrar_log(usuario_log, "Edição", detalhe)

def atualizar_status(usuario_log, id_reg, novo_status):
    with engine.connect() as conn:
        antigo = conn.execute(text("SELECT descricao FROM financeiro WHERE id=:id"), {'id': id_reg}).fetchone()
        conn.execute(text("UPDATE financeiro SET status = :s WHERE id = :i"), {'s': novo_status, 'i': id_reg})
        conn.commit()

    desc = antigo[0] if antigo else f"ID {id_reg}"
    registrar_log(usuario_log, "Alteração Status", f"{desc} -> {novo_status}")

def excluir_registro(usuario_log, id_reg):
    with engine.connect() as conn:
        antigo = conn.execute(text("SELECT descricao, valor FROM financeiro WHERE id=:id"), {'id': id_reg}).fetchone()
        conn.execute(text("DELETE FROM financeiro WHERE id = :i"), {'i': id_reg})
        conn.commit()

    detalhe = f"{antigo[0]} (R$ {antigo[1]})" if antigo else f"ID {id_reg}"
    registrar_log(usuario_log, "Exclusão", f"Apagou: {detalhe}")

    # --- FLUXO DE CAIXA ---
def adicionar_entrada(usuario, valor, forma_pagamento, data_iso):
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO entradas_caixa (data_registro, valor, forma_pagamento, usuario) VALUES (:d, :v, :fp, :u)"),
                     {'d': data_iso, 'v': valor, 'fp': forma_pagamento, 'u': usuario})
        conn.commit()
    registrar_log(usuario, "Entrada Caixa", f"R$ {valor} ({forma_pagamento})")

def excluir_entrada(usuario, id_entrada):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM entradas_caixa WHERE id = :id"), {'id': id_entrada})
        conn.commit()
    registrar_log(usuario, "Exclusão Caixa", f"Removeu entrada ID {id_entrada}")

def adicionar_saida_caixa(usuario, descricao, valor, forma_pagamento, data_iso):
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO saidas_caixa (data_registro, descricao, valor, forma_pagamento, usuario) VALUES (:d, :desc, :v, :fp, :u)"),
                     {'d': data_iso, 'desc': descricao, 'v': valor, 'fp': forma_pagamento, 'u': usuario})
        conn.commit()
    registrar_log(usuario, "Saída Caixa", f"R$ {valor} - {descricao}")

def excluir_saida_caixa(usuario, id_saida):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM saidas_caixa WHERE id = :id"), {'id': id_saida})
        conn.commit()
    registrar_log(usuario, "Exclusão Caixa", f"Removeu saída ID {id_saida}")

def obter_resumo_fluxo(mes=None, ano=None):
    if not mes or not ano:
        hoje = datetime.now()
        mes, ano = f"{hoje.month:02d}", str(hoje.year)

    filtro_data_iso = f"{ano}-{mes}%"

    resumo = {
        'entradas_total': 0.0, 'entradas_dinheiro': 0.0, 'entradas_pix': 0.0, 'entradas_cartao': 0.0,
        'saidas_total': 0.0,
        'saldo': 0.0,
        'extrato': []
    }

    with engine.connect() as conn:
        # 1. ENTRADAS (Soma Otimizada SQL)
        sql_entradas_sum = text("""
                                SELECT
                                    COALESCE(SUM(valor), 0) as total,
                                    COALESCE(SUM(CASE WHEN forma_pagamento = 'Dinheiro' THEN valor ELSE 0 END), 0) as dinheiro,
                                    COALESCE(SUM(CASE WHEN forma_pagamento = 'PIX' THEN valor ELSE 0 END), 0) as pix,
                                    COALESCE(SUM(CASE WHEN forma_pagamento = 'Cartão' THEN valor ELSE 0 END), 0) as cartao
                                FROM entradas_caixa
                                WHERE data_registro LIKE :d
                                """)
        res_entradas = conn.execute(sql_entradas_sum, {'d': filtro_data_iso}).fetchone()

        if res_entradas:
            resumo['entradas_total'] = res_entradas.total
            resumo['entradas_dinheiro'] = res_entradas.dinheiro
            resumo['entradas_pix'] = res_entradas.pix
            resumo['entradas_cartao'] = res_entradas.cartao

        # 2. SAÍDAS CAIXA (Soma Otimizada SQL)
        sql_saidas_sum = text("SELECT COALESCE(SUM(valor), 0) FROM saidas_caixa WHERE data_registro LIKE :d")
        total_saidas_caixa = conn.execute(sql_saidas_sum, {'d': filtro_data_iso}).scalar()
        resumo['saidas_total'] += total_saidas_caixa

        # 3. SAÍDAS BOLETOS (Soma Otimizada SQL)
        sql_boletos_sum = text("""
                               SELECT COALESCE(SUM(valor), 0) FROM financeiro
                               WHERE status = 'Pago'
                                 AND substr(vencimento, 7, 4) = :ano
                                 AND substr(vencimento, 4, 2) = :mes
                               """)
        total_boletos = conn.execute(sql_boletos_sum, {'ano': ano, 'mes': mes}).scalar()
        resumo['saidas_total'] += total_boletos

        # 4. EXTRATO (Recuperação de dados)
        entradas_rows = conn.execute(text(
            "SELECT id, data_registro, valor, forma_pagamento FROM entradas_caixa WHERE data_registro LIKE :d ORDER BY data_registro DESC"
        ), {'d': filtro_data_iso}).fetchall()

        for row in entradas_rows:
            resumo['extrato'].append({
                'data': row.data_registro,
                'descricao': 'Entrada Avulsa',
                'valor': row.valor,
                'tipo': 'entrada',
                'categoria': row.forma_pagamento,
                'id': row.id
            })

        saidas_rows = conn.execute(text(
            "SELECT id, data_registro, descricao, valor, forma_pagamento FROM saidas_caixa WHERE data_registro LIKE :d ORDER BY data_registro DESC"
        ), {'d': filtro_data_iso}).fetchall()

        for row in saidas_rows:
            desc_texto = row.descricao if row.descricao else 'Saída Avulsa'
            resumo['extrato'].append({
                'data': row.data_registro,
                'descricao': desc_texto,
                'valor': row.valor,
                'tipo': 'saida_caixa',
                'categoria': row.forma_pagamento,
                'id': row.id
            })

        boletos_rows = conn.execute(text("""
                                         SELECT vencimento, descricao, valor
                                         FROM financeiro
                                         WHERE status = 'Pago'
                                           AND substr(vencimento, 7, 4) = :ano
                                           AND substr(vencimento, 4, 2) = :mes
                                         """), {'ano': ano, 'mes': mes}).fetchall()

        for row in boletos_rows:
            # Correção do Broad Exception (agora captura apenas ValueError se a data estiver errada)
            try:
                dt_obj = datetime.strptime(row.vencimento, '%d/%m/%Y')
                data_fmt = dt_obj.strftime('%Y-%m-%d')
            except ValueError:
                data_fmt = row.vencimento

            resumo['extrato'].append({
                'data': data_fmt,
                'descricao': row.descricao,
                'valor': row.valor,
                'tipo': 'saida_boleto',
                'categoria': 'Conta Paga',
                'id': 0
            })

    resumo['extrato'].sort(key=lambda x: x['data'], reverse=True)
    resumo['saldo'] = resumo['entradas_total'] - resumo['saidas_total']

    return resumo