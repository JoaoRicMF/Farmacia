from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Instância do Banco de Dados
db = SQLAlchemy()

class Financeiro(db.Model):
    __tablename__ = 'financeiro'

    id = db.Column(db.Integer, primary_key=True)
    # Mudança: String -> Date/DateTime
    data_processamento = db.Column(db.DateTime, default=datetime.now)
    descricao = db.Column(db.String(200), nullable=False)
    valor = db.Column(db.Float, nullable=False)
    codigo_barras = db.Column(db.String(100), nullable=True)

    # Mudança: String -> Date. Removemos nullable=True se for obrigatório,
    # mas mantemos por segurança na migração
    vencimento = db.Column(db.Date, nullable=True)

    status = db.Column(db.String(20), default='Pendente')
    categoria = db.Column(db.String(50), default='Outros')

    def to_dict(self):
        return {
            'id': self.id,
            'data_processamento': self.data_processamento.isoformat() if self.data_processamento else None,
            'descricao': self.descricao,
            'valor': self.valor,
            'codigo_barras': self.codigo_barras,
            'vencimento': self.vencimento.strftime('%d/%m/%Y') if self.vencimento else None,
            'status': self.status,
            'categoria': self.categoria
        }

class Usuario(db.Model):
    __tablename__ = 'usuarios'
    # ... (sem alterações aqui) ...
    id = db.Column(db.Integer, primary_key=True)
    usuario = db.Column(db.String(50), unique=True, nullable=False)
    senha = db.Column(db.String(200), nullable=False)
    nome = db.Column(db.String(100), nullable=False)
    funcao = db.Column(db.String(20), default='Operador')

class Log(db.Model):
    __tablename__ = 'logs'

    id = db.Column(db.Integer, primary_key=True)
    # Mudança: String -> DateTime
    data_hora = db.Column(db.DateTime, default=datetime.now)
    usuario = db.Column(db.String(50))
    acao = db.Column(db.String(50))
    detalhes = db.Column(db.String(255))

class EntradaCaixa(db.Model):
    __tablename__ = 'entradas_caixa'

    id = db.Column(db.Integer, primary_key=True)
    # Mudança: String -> Date
    data_registro = db.Column(db.Date)
    descricao = db.Column(db.String(200), nullable=True)
    valor = db.Column(db.Float)
    forma_pagamento = db.Column(db.String(50))
    usuario = db.Column(db.String(50))

class SaidaCaixa(db.Model):
    __tablename__ = 'saidas_caixa'

    id = db.Column(db.Integer, primary_key=True)
    # Mudança: String -> Date
    data_registro = db.Column(db.Date)
    descricao = db.Column(db.String(200))
    valor = db.Column(db.Float)
    forma_pagamento = db.Column(db.String(50))
    usuario = db.Column(db.String(50))