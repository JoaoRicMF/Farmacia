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


# --- SEGURANÇA E HASH ---
def gerar_hash_senha(senha):
    """Gera um hash SHA-256 seguro para a senha."""
    return hashlib.sha256(senha.encode()).hexdigest()


def verificar_login(usuario, senha):
    """Verifica se usuário e senha batem no banco."""
    senha_hash = gerar_hash_senha(senha)
    with engine.connect() as conn:
        res = conn.execute(text("SELECT id, nome FROM usuarios WHERE usuario = :u AND senha = :s"),
                           {'u': usuario, 's': senha_hash}).fetchone()
        return res  # Retorna None se falhar, ou (id, nome) se sucesso


def criar_usuario_inicial():
    """Cria o admin padrão se não houver usuários."""
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM usuarios")).scalar()
        if count == 0:
            senha_padrao = gerar_hash_senha("admin123")
            conn.execute(text("INSERT INTO usuarios (usuario, senha, nome, funcao) VALUES (:u, :s, :n, :f)"),
                         {'u': 'admin', 's': senha_padrao, 'n': 'Administrador', 'f': 'Gerente'})
            conn.commit()
            print("⚠️ Usuário 'admin' criado com senha 'admin123'. Altere assim que possível!")


# --- AUDITORIA (LOGS) ---
def registrar_log(usuario_nome, acao, detalhes=""):
    """Grava quem fez o quê."""
    data_hora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO logs (data_hora, usuario, acao, detalhes) VALUES (:d, :u, :a, :det)"),
                     {'d': data_hora, 'u': usuario_nome, 'a': acao, 'det': detalhes})
        conn.commit()


# --- BACKUP E INIT ---
def realizar_backup_automatico():
    if not os.path.exists(BACKUP_FOLDER): os.makedirs(BACKUP_FOLDER)
    if not os.path.exists(DB_PATH): return
    hoje = datetime.now().strftime('%Y-%m-%d')
    bkp = os.path.join(BACKUP_FOLDER, f"financeiro_backup_{hoje}.db")
    if not os.path.exists(bkp):
        try:
            shutil.copy2(DB_PATH, bkp)
        except:
            pass
    # Limpeza backups antigos
    try:
        bkps = sorted([os.path.join(BACKUP_FOLDER, f) for f in os.listdir(BACKUP_FOLDER) if f.endswith('.db')])
        while len(bkps) > 30: os.remove(bkps[0]); bkps.pop(0)
    except:
        pass


def init_db():
    if not os.path.exists(DB_FOLDER): os.makedirs(DB_FOLDER)
    realizar_backup_automatico()

    with engine.connect() as conn:
        # Tabela Financeiro
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

        # Tabela Usuários
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE,
                senha TEXT,
                nome TEXT,
                funcao TEXT
            )
        '''))

        # Tabela Logs de Auditoria
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_hora TEXT,
                usuario TEXT,
                acao TEXT,
                detalhes TEXT
            )
        '''))

        # Migrações (se necessário)
        try:
            cols = pd.read_sql(text("PRAGMA table_info(financeiro)"), conn)['name'].tolist()
            if 'categoria' not in cols:
                conn.execute(text("ALTER TABLE financeiro ADD COLUMN categoria TEXT DEFAULT 'Outros'"))
        except:
            pass

    criar_usuario_inicial()


# --- FUNÇÕES DE LEITURA (PÚBLICAS) ---
def listar_registros(busca=None, status_filtro="Todos", categoria_filtro="Todas", d_ini=None, d_fim=None, limit=None,
                     offset=0):
    try:
        q = "SELECT * FROM financeiro WHERE 1=1"
        p = {}
        if busca: q += " AND descricao LIKE :b"; p['b'] = f"%{busca}%"
        if status_filtro != "Todos": q += " AND status = :s"; p['s'] = status_filtro
        if categoria_filtro != "Todas": q += " AND categoria = :c"; p['c'] = categoria_filtro
        if d_ini: q += " AND (substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) || '-' || substr(vencimento, 1, 2)) >= :di";
        p['di'] = d_ini
        if d_fim: q += " AND (substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) || '-' || substr(vencimento, 1, 2)) <= :df";
        p['df'] = d_fim

        q += " ORDER BY substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) || '-' || substr(vencimento, 1, 2) ASC"
        if limit: q += " LIMIT :lim OFFSET :off"; p['lim'] = limit; p['off'] = offset

        return pd.read_sql(text(q), engine, params=p)
    except:
        return pd.DataFrame()


def obter_logs():
    """Retorna os últimos 100 logs para auditoria."""
    return pd.read_sql(text("SELECT * FROM logs ORDER BY id DESC LIMIT 100"), engine)


def obter_dados_calendario():
    try:
        df = pd.read_sql(text("SELECT * FROM financeiro"), engine)
        evs = []
        for _, r in df.iterrows():
            try:
                dt = datetime.strptime(r['vencimento'], '%d/%m/%Y').strftime('%Y-%m-%d')
            except:
                continue
            cor = "#28a745" if r['status'] == "Pago" else "#dc3545"
            evs.append({"title": f"R$ {r['valor']:.2f} - {r['descricao']}", "start": dt, "backgroundColor": cor,
                        "borderColor": cor})
        return evs
    except:
        return []


def contar_registros(busca=None, status_filtro="Todos", cat_filtro="Todas", d_ini=None, d_fim=None):
    with engine.connect() as conn:
        q = "SELECT COUNT(*) FROM financeiro WHERE 1=1"
        p = {}
        if busca: q += " AND descricao LIKE :b"; p['b'] = f"%{busca}%"
        if status_filtro != "Todos": q += " AND status = :s"; p['s'] = status_filtro
        if cat_filtro != "Todas": q += " AND categoria = :c"; p['c'] = cat_filtro
        if d_ini: q += " AND (substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) || '-' || substr(vencimento, 1, 2)) >= :di";
        p['di'] = d_ini
        if d_fim: q += " AND (substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) || '-' || substr(vencimento, 1, 2)) <= :df";
        p['df'] = d_fim
        return conn.execute(text(q), p).scalar()


def obter_dados_grafico_tempo():
    with engine.connect() as c: return pd.read_sql(text(
        "SELECT substr(vencimento, 7, 4) || '-' || substr(vencimento, 4, 2) as mes, SUM(valor) as total FROM financeiro GROUP BY mes ORDER BY mes ASC"),
                                                   c)


def obter_dados_grafico_categoria():
    with engine.connect() as c: return pd.read_sql(
        text("SELECT categoria, SUM(valor) as total FROM financeiro GROUP BY categoria ORDER BY total DESC"), c)


# --- CRUD COM AUDITORIA (MUDANÇA PRINCIPAL) ---
def adicionar_registro(usuario_log, data_proc, descricao, valor, codigo_barras, vencimento, status, categoria):
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO financeiro (data_processamento, descricao, valor, codigo_barras, vencimento, status, categoria) VALUES (:d, :desc, :val, :c, :v, :s, :cat)"),
                     {'d': data_proc, 'desc': descricao, 'val': valor, 'c': codigo_barras, 'v': vencimento, 's': status,
                      'cat': categoria})
        conn.commit()
    # Registra no log
    registrar_log(usuario_log, "Novo Lançamento", f"Valor: {valor} | Fornecedor: {descricao}")


def verificar_existencia_boleto(codigo):
    with engine.connect() as c: return c.execute(text("SELECT id FROM financeiro WHERE codigo_barras = :c"),
                                                 {'c': codigo}).fetchone() is not None


def atualizar_status(usuario_log, id_reg, novo_status):
    # Primeiro pega dados antigos para log
    with engine.connect() as conn:
        antigo = conn.execute(text("SELECT descricao, status FROM financeiro WHERE id=:id"), {'id': id_reg}).fetchone()
        conn.execute(text("UPDATE financeiro SET status = :s WHERE id = :i"), {'s': novo_status, 'i': id_reg})
        conn.commit()

    desc = antigo[0] if antigo else "Desconhecido"
    status_ant = antigo[1] if antigo else "?"
    registrar_log(usuario_log, "Alteração Status", f"ID {id_reg} ({desc}): {status_ant} -> {novo_status}")


def excluir_registro(usuario_log, id_reg):
    with engine.connect() as conn:
        antigo = conn.execute(text("SELECT descricao, valor FROM financeiro WHERE id=:id"), {'id': id_reg}).fetchone()
        conn.execute(text("DELETE FROM financeiro WHERE id = :i"), {'i': id_reg})
        conn.commit()

    detalhe = f"{antigo[0]} (R$ {antigo[1]})" if antigo else f"ID {id_reg}"
    registrar_log(usuario_log, "Exclusão", f"Apagou registro: {detalhe}")


def importar_dataframe(usuario_log, df):
    if 'categoria' not in df.columns: df['categoria'] = 'Outros'
    df.to_sql('financeiro', engine, if_exists='append', index=False)
    registrar_log(usuario_log, "Importação em Massa", f"Importou {len(df)} registros via Excel")