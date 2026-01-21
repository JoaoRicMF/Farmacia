import os
import logging
from flask import Flask, render_template
from flask_migrate import Migrate
from models import db
import database_manager as db_manager
from flask_wtf.csrf import CSRFProtect
from routes import auth, dashboard, financeiro

# --- CONFIGURAÇÃO DE LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("app.log"), logging.StreamHandler()]
)

app = Flask(__name__)

# --- CONFIGURAÇÃO DO BANCO DE DADOS ---
# Define o caminho base do projeto (onde está este arquivo server.py)
base_dir = os.path.abspath(os.path.dirname(__file__))

# Define a pasta do banco de dados
db_folder = os.path.join(base_dir, 'database')

# Cria a pasta 'database' se ela não existir
if not os.path.exists(db_folder):
    os.makedirs(db_folder)
    logging.info(f"Pasta criada: {db_folder}")

# Define o URL padrão do SQLite com caminho absoluto
default_db_url = f"sqlite:///{os.path.join(db_folder, 'financeiro.db')}"

# Verifica se existe variável de ambiente (Render/Heroku), senão usa o padrão
database_url = os.getenv("DATABASE_URL", default_db_url)

# Corrige protocolo do Postgres se necessário (compatibilidade com versões antigas do driver)
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'chave_dev_padrao_insira_uma_chave_forte_em_prod')

# --- INICIALIZAÇÃO EXTENSÕES ---
db.init_app(app)
migrate = Migrate(app, db)
csrf = CSRFProtect(app)

# --- INICIALIZAÇÃO DO BANCO ---
# Garante que as tabelas existem antes de o servidor aceitar requisições
# (Nota: Em produção estrita, isso seria feito apenas via 'flask db upgrade')
db_manager.init_db(app)

# --- BLUEPRINTS ---
app.register_blueprint(auth.bp)
app.register_blueprint(dashboard.bp)
app.register_blueprint(financeiro.bp)

# --- ROTA PRINCIPAL ---
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)