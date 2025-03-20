from app import app, db
from models import Chat, Message
import sqlite3
import psycopg2
from datetime import datetime

def migrate_data():
    # Kết nối với SQLite
    sqlite_conn = sqlite3.connect('instance/chats.db')
    sqlite_cur = sqlite_conn.cursor()

    # Kết nối với PostgreSQL
    with app.app_context():
        # Tạo bảng mới
        db.create_all()

        # Migrate chats
        sqlite_cur.execute('SELECT * FROM chat')
        chats = sqlite_cur.fetchall()
        for chat in chats:
            new_chat = Chat(
                id=chat[0],
                title=chat[1],
                created_at=datetime.fromisoformat(chat[2]),
                user_id=chat[3]
            )
            db.session.add(new_chat)

        # Migrate messages
        sqlite_cur.execute('SELECT * FROM message')
        messages = sqlite_cur.fetchall()
        for msg in messages:
            new_message = Message(
                id=msg[0],
                content=msg[1],
                role=msg[2],
                created_at=datetime.fromisoformat(msg[3]),
                chat_id=msg[4]
            )
            db.session.add(new_message)

        # Lưu thay đổi
        db.session.commit()

    sqlite_conn.close()

if __name__ == '__main__':
    migrate_data() 