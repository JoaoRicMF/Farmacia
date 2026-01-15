import os
import shutil
import pandas as pd
from datetime import datetime
import hashlib
from sqlalchemy import create_engine, text

# CONFIGURAÇÕES
DB_FOLDER = 'database'
BACKUP_FOLDER = 'backups'
DB_FILE = 'financeiro.db'
DB_PATH = os.path.join(DB_FOLDER, DB_FILE)
DATABASE_URL = f"sqlite:///{DB_PATH}"

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
    if not os.path.exists(DB_FOLDER): os.makedirs(DB_FOLDER)

    # Criação das Tabelas
    with engine.connect() as conn:
        conn.execute(text('''
                          CREATE TABLE IF NOT EXISTS financeiro (
                                                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                    data_processamento TEXT,
                                                                    descricao TEXT,
                                                                    valor REAL,
                                                                    codigo_barras TEXT,
                                                                    vencimento TEXT,
                                                                    status TEXT,
                                                                    categoria TEXT DEFAULT 'Outros'
                          )
                          '''))
        conn.execute(text('''
                          CREATE TABLE IF NOT EXISTS usuarios (
                                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                  usuario TEXT UNIQUE,
                                                                  senha TEXT,
                                                                  nome TEXT,
                                                                  funcao TEXT
                          )
                          '''))
        conn.execute(text('''
                          CREATE TABLE IF NOT EXISTS logs (
                                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                              data_hora TEXT,
                                                              usuario TEXT,
                                                              acao TEXT,
                                                              detalhes TEXT
                          )
                          '''))
        conn.execute(text('''
                          CREATE TABLE IF NOT EXISTS entradas_caixa (
                                                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                        data_registro TEXT,
                                                                        descricao TEXT,
                                                                        valor REAL,
                                                                        forma_pagamento TEXT,
                                                                        usuario TEXT
                          )
                          '''))

        # Migração simples para garantir colunas novas
        try:
            cols = pd.read_sql(text("PRAGMA table_info(financeiro)"), conn)['name'].tolist()
            if 'categoria' not in cols:
                conn.execute(text("ALTER TABLE financeiro ADD COLUMN categoria TEXT DEFAULT 'Outros'"))
        except: pass

    criar_usuario_inicial()

# --- FUNÇÕES DE LEITURA ---
def listar_registros(busca=None, status_filtro="Todos", categoria_filtro="Todas", d_ini=None, d_fim=None, limit=None, offset=0):
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

        # CORREÇÃO: Ordena por ID DESC (Mais seguro que data string)
        q += " ORDER BY id DESC"

        if limit:
            q += " LIMIT :lim OFFSET :off"
            p['lim'] = limit
            p['off'] = offset

        with engine.connect() as conn:
            return pd.read_sql(text(q), conn, params=p)

    except Exception as e:
        print(f"Erro ao listar: {e}")
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
        # Tenta agrupar por mês/ano usando substr da data string
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
def adicionar_entrada(usuario, descricao, valor, forma_pagamento, data_iso):
    # data_iso deve vir YYYY-MM-DD
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO entradas_caixa (data_registro, valor, forma_pagamento, usuario) VALUES (:d, :desc, :v, :fp, :u)"),
                     {'d': data_iso, 'desc': descricao, 'v': valor, 'fp': forma_pagamento, 'u': usuario})
        conn.commit()
    registrar_log(usuario, "Entrada Caixa", f"R$ {valor} ({forma_pagamento}) - {descricao}")

def excluir_entrada(usuario, id_entrada):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM entradas_caixa WHERE id = :id"), {'id': id_entrada})
        conn.commit()
    registrar_log(usuario, "Exclusão Caixa", f"Removeu entrada ID {id_entrada}")

def obter_resumo_fluxo(mes=None, ano=None):
    if not mes or not ano:
        hoje = datetime.now()
        mes, ano = f"{hoje.month:02d}", str(hoje.year)

    filtro_data = f"{ano}-{mes}%"

    with engine.connect() as conn:
        # Selecionamos colunas específicas para não depender da 'descricao' existir na tabela
        # Se o banco for antigo, ele ignora a coluna descricao. Se for novo, ela nem existe.
        entradas_df = pd.read_sql(text("SELECT id, data_registro, valor, forma_pagamento FROM entradas_caixa WHERE data_registro LIKE :d ORDER BY data_registro DESC"),
                                  conn, params={'d': filtro_data})

        saidas_raw = pd.read_sql(text("SELECT vencimento, descricao, valor, status FROM financeiro WHERE status = 'Pago'"), conn)

    resumo = {
        'entradas_total': 0.0,
        'entradas_dinheiro': 0.0,
        'entradas_pix': 0.0,
        'entradas_cartao': 0.0,
        'saidas_total': 0.0,
        'saldo': 0.0,
        'extrato': []
    }

    if not entradas_df.empty:
        resumo['entradas_total'] = entradas_df['valor'].sum()
        resumo['entradas_dinheiro'] = entradas_df[entradas_df['forma_pagamento'] == 'Dinheiro']['valor'].sum()
        resumo['entradas_pix'] = entradas_df[entradas_df['forma_pagamento'] == 'PIX']['valor'].sum()
        resumo['entradas_cartao'] = entradas_df[entradas_df['forma_pagamento'] == 'Cartão']['valor'].sum()

        for _, row in entradas_df.iterrows():
            resumo['extrato'].append({
                'data': row['data_registro'],
                'descricao': 'Entrada de Caixa', # Texto padrão
                'valor': row['valor'],
                'tipo': 'entrada',
                'categoria': row['forma_pagamento'],
                'id': row['id']
            })

    # ... (O RESTO DA FUNÇÃO CONTINUA IGUAL PARA AS SAÍDAS) ...
    if not saidas_raw.empty:
        # ... (código existente das saídas) ...
        saidas_raw['dt_obj'] = pd.to_datetime(saidas_raw['vencimento'], dayfirst=True, errors='coerce')
        mask = (saidas_raw['dt_obj'].dt.month == int(mes)) & (saidas_raw['dt_obj'].dt.year == int(ano))
        saidas_mes = saidas_raw[mask]

        resumo['saidas_total'] = saidas_mes['valor'].sum()

        for _, row in saidas_mes.iterrows():
            resumo['extrato'].append({
                'data': row['dt_obj'].strftime('%Y-%m-%d') if pd.notnull(row['dt_obj']) else row['vencimento'],
                'descricao': row['descricao'], # Saídas mantêm a descrição do boleto
                'valor': row['valor'],
                'tipo': 'saida',
                'categoria': 'Conta Paga',
                'id': 0
            })

    resumo['extrato'].sort(key=lambda x: x['data'], reverse=True)
    resumo['saldo'] = resumo['entradas_total'] - resumo['saidas_total']

    return resumo