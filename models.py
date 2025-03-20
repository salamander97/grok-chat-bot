from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import JSON
from database import db

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    chats = db.relationship('Chat', backref='user', lazy=True)

    def __init__(self, username, password):
        self.username = username
        self.password = password

class Chat(db.Model):
    __tablename__ = 'chats'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    messages = db.relationship('Message', backref='chat', lazy=True, cascade='all, delete-orphan')
    chat_metadata = db.Column(JSON)  # Đổi từ metadata thành chat_metadata

    def __init__(self, title, user_id, chat_metadata=None):
        self.title = title
        self.user_id = user_id
        self.chat_metadata = chat_metadata or {}

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    role = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    chat_id = db.Column(db.Integer, db.ForeignKey('chats.id', ondelete='CASCADE'), nullable=False)
    message_metadata = db.Column(JSON)  # Đổi từ metadata thành message_metadata

    def __init__(self, content, role, chat_id, message_metadata=None):
        self.content = content
        self.role = role
        self.chat_id = chat_id
        self.message_metadata = message_metadata or {} 

class UploadedFile(db.Model):
    __tablename__ = 'uploaded_files'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.Integer)
    file_content = db.Column(db.Text)  # Lưu nội dung file (text) hoặc mô tả file
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    chat_id = db.Column(db.Integer, db.ForeignKey('chats.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    file_metadata = db.Column(JSON)

    def __init__(self, filename, original_filename, file_path, mime_type, chat_id, user_id, file_size=None, file_content=None, file_metadata=None):
        self.filename = filename
        self.original_filename = original_filename
        self.file_path = file_path
        self.mime_type = mime_type
        self.file_size = file_size
        self.file_content = file_content
        self.chat_id = chat_id
        self.user_id = user_id
        self.file_metadata = file_metadata or {}