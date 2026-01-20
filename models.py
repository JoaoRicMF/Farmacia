from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Instância do Banco de Dados
db = SQLAlchemy()

class Financeiro(db.Model):
    __tablename__ = 'financeiro'

    id = db.Column(db.Integer, primary_key=True)
    data_processamento = db.Column(db.String(20), nullable=True)
    descricao = db.Column(db.String(200), nullable=False)
    valor = db.Column(db.Float, nullable=False)
    codigo_barras = db.Column(db.String(100), nullable=True)
    vencimento = db.Column(db.String(20), nullable=True)
    status = db.Column(db.String(20), default='Pendente')
    categoria = db.Column(db.String(50), default='Outros')

class Usuario(db.Model):
    __tablename__ = 'usuarios'

    id = db.Column(db.Integer, primary_key=True)
    usuario = db.Column(db.String(50), unique=True, nullable=False)
    senha = db.Column(db.String(200), nullable=False)
    nome = db.Column(db.String(100), nullable=False)
    funcao = db.Column(db.String(20), default='Operador')

class Log(db.Model):
    __tablename__ = 'logs'

    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.String(30))
    usuario = db.Column(db.String(50))
    acao = db.Column(db.String(50))
    detalhes = db.Column(db.String(255))

class EntradaCaixa(db.Model):
    __tablename__ = 'entradas_caixa'

    id = db.Column(db.Integer, primary_key=True)
    data_registro = db.Column(db.String(20))
    descricao = db.Column(db.String(200), nullable=True) # Adicionado para consistência futura
    valor = db.Column(db.Float)
    forma_pagamento = db.Column(db.String(50))
    usuario = db.Column(db.String(50))

class SaidaCaixa(db.Model):
    __tablename__ = 'saidas_caixa'

    id = db.Column(db.Integer, primary_key=True)
    data_registro = db.Column(db.String(20))
    descricao = db.Column(db.String(200))
    valor = db.Column(db.Float)
    forma_pagamento = db.Column(db.String(50))
    usuario = db.Column(db.String(50))