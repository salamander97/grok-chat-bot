from app import app, db
from models import Chat, Message

def update_chat_titles():
    with app.app_context():
        # Lấy tất cả các chat
        chats = Chat.query.all()
        
        for chat in chats:
            # Lấy tin nhắn đầu tiên của chat
            first_message = Message.query.filter_by(chat_id=chat.id).order_by(Message.created_at.asc()).first()
            
            if first_message:
                # Cập nhật title dựa trên nội dung tin nhắn đầu tiên
                chat.title = first_message.content[:50] + ('...' if len(first_message.content) > 50 else '')
                print(f"Updated chat {chat.id} title to: {chat.title}")
        
        # Lưu thay đổi
        db.session.commit()
        print("All chat titles have been updated!")

if __name__ == '__main__':
    update_chat_titles() 