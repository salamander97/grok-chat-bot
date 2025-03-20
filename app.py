from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from models import Chat, Message, User, UploadedFile 
import requests
from functools import wraps
import os
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from models import Chat, Message, User
from datetime import datetime
from database import db
import hashlib
import base64

def init_env():
    """Initialize environment variables"""
    load_dotenv()
    
    required_vars = [
        'FLASK_SECRET_KEY',
        'GROK_API_KEY',
        'GEMINI_API_KEY',
        'DATABASE_URL'
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    # Kiểm tra format của GROK_API_KEY
    grok_api_key = os.getenv('GROK_API_KEY')
    if not grok_api_key.startswith('xai-'):
        raise ValueError("Invalid GROK_API_KEY format")
        
    return {var: os.getenv(var) for var in required_vars}

def create_app():
    """Create Flask application"""
    env_vars = init_env()
    
    app = Flask(__name__)
    app.secret_key = env_vars['FLASK_SECRET_KEY']
    
    # Cấu hình PostgreSQL
    app.config['SQLALCHEMY_DATABASE_URI'] = env_vars['DATABASE_URL']
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Khởi tạo database
    db.init_app(app)
    
    return app

app = create_app()

# Tạo bảng trong database khi khởi động
with app.app_context():
    db.create_all()
    # Tạo tài khoản admin mặc định nếu chưa có
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(
            username='admin',
            password=hashlib.sha256('password123'.encode()).hexdigest()
        )
        db.session.add(admin)
        db.session.commit()

# Lấy giá trị từ biến môi trường
GROK_API_KEY = os.getenv('GROK_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# API URLs
GROK_API_URL = "https://api.x.ai/v1/chat/completions"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Cập nhật URL API và model của Gemini
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Cập nhật hàm call_ai_api cho phần Gemini
def call_ai_api(messages, model='grok'):
    try:
        if model == 'grok':
            response = requests.post(
                GROK_API_URL,
                headers={
                    'Authorization': f'Bearer {GROK_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'messages': messages,
                    'model': 'grok-2-latest',
                    'stream': False,
                    'temperature': 1.0
                }
            )
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']
        elif model == 'gemini':
            # Chuẩn bị nội dung cho Gemini API
            # Với model gemini-2.0-flash, cấu trúc request đơn giản hơn
            gemini_content = []
            
            # Lấy tin nhắn cuối cùng từ người dùng
            latest_user_message = None
            for msg in reversed(messages):
                if msg['role'] == 'user':
                    latest_user_message = msg['content']
                    break
            
            if latest_user_message:
                gemini_content.append({
                    "parts": [{"text": latest_user_message}]
                })
            else:
                # Fallback nếu không tìm thấy tin nhắn người dùng
                gemini_content.append({
                    "parts": [{"text": "Xin chào"}]
                })
                
            try:
                response = requests.post(
                    f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                    headers={
                        'Content-Type': 'application/json'
                    },
                    json={
                        "contents": gemini_content,
                        "generationConfig": {
                            "temperature": 1.0,
                            "topP": 0.95,
                            "maxOutputTokens": 8192
                        }
                    },
                    timeout=30
                )
                
                response.raise_for_status()
                result_json = response.json()
                
                # Debug response
                print("Gemini API Response Structure:", list(result_json.keys()))
                
                # Xử lý response theo định dạng API v1beta
                if "candidates" in result_json and len(result_json["candidates"]) > 0:
                    candidate = result_json["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        return candidate["content"]["parts"][0]["text"]
                
                # Nếu không tìm thấy nội dung phù hợp
                return "Không thể xử lý phản hồi từ Gemini API. Vui lòng thử lại."
                
            except requests.exceptions.RequestException as e:
                print(f"API Request Error: {str(e)}")
                return f"Lỗi kết nối đến Gemini API: {str(e)}"
        else:
            return "Model không được hỗ trợ. Vui lòng chọn 'grok' hoặc 'gemini'."
    except Exception as e:
        print(f"Error calling AI API: {str(e)}")
        return f"Lỗi xử lý yêu cầu: {str(e)}"
    
    
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    
    data = request.json
    username = data.get('username')
    password = hashlib.sha256(data.get('password').encode()).hexdigest()
    
    user = User.query.filter_by(username=username, password=password).first()
    
    if user:
        session['user_id'] = user.id
        session['username'] = user.username
        return jsonify({'success': True})
    
    return jsonify({
        'success': False,
        'message': 'Tên đăng nhập hoặc mật khẩu không đúng'
    })

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def home():
    return redirect(url_for('chat'))

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html', username=session['username'])

@app.route('/chat/send', methods=['POST'])
@login_required
def chat_send():
    data = request.json
    message = data.get('message')
    chat_id = data.get('chat_id')
    model = data.get('model', 'grok')  # Lấy model từ request, mặc định là grok
    
    if not chat_id:
        # Tạo chat mới nếu chưa có
        chat = Chat(
            title="New Chat",
            user_id=session['user_id']
        )
        db.session.add(chat)
        db.session.commit()
        chat_id = chat.id
    
    # Lưu thông tin model vào metadata
    message_metadata = {'model': model}
    
    # Lưu tin nhắn của user
    user_message = Message(
        content=message,
        role='user',
        chat_id=chat_id,
        message_metadata={}
    )
    db.session.add(user_message)
    
    # Nếu là tin nhắn đầu tiên, cập nhật title của chat
    if Message.query.filter_by(chat_id=chat_id).count() == 1:
        chat = Chat.query.get(chat_id)
        # Lấy 50 ký tự đầu của tin nhắn làm title
        chat.title = message[:50] + ('...' if len(message) > 50 else '')
        db.session.commit()
    
    # Lấy lịch sử chat từ database
    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at).all()
    chat_history = [
        {
            'role': msg.role,
            'content': msg.content
        } for msg in messages
    ]
    
    # Gọi API AI với lịch sử chat và model được chọn
    ai_response = call_ai_api(chat_history, model)
    
    # Lưu tin nhắn của AI với thông tin model
    ai_message = Message(
        content=ai_response,
        role='assistant',
        chat_id=chat_id,
        message_metadata=message_metadata
    )
    db.session.add(ai_message)
    db.session.commit()
    
    return jsonify({
        'response': ai_response,
        'chat_id': chat_id,
        'model': model
    })

@app.route('/api/chats', methods=['GET'])
@login_required
def get_chats():
    chats = Chat.query.filter_by(user_id=session['user_id']).order_by(Chat.created_at.desc()).all()
    return jsonify([{
        'id': chat.id,
        'title': chat.title,
        'created_at': chat.created_at.isoformat()
    } for chat in chats])

@app.route('/api/chats', methods=['POST'])
@login_required
def create_chat():
    chat = Chat(
        title="New Chat",
        user_id=session['user_id']
    )
    db.session.add(chat)
    db.session.commit()
    
    return jsonify({
        'id': chat.id,
        'title': chat.title,
        'created_at': chat.created_at.isoformat()
    })

@app.route('/api/chats/<int:chat_id>', methods=['GET'])
@login_required
def get_chat(chat_id):
    chat = Chat.query.filter_by(id=chat_id, user_id=session['user_id']).first_or_404()
    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at.asc()).all()
    
    return jsonify({
        'id': chat.id,
        'title': chat.title,
        'created_at': chat.created_at.isoformat(),
        'messages': [{
            'id': msg.id,
            'role': msg.role,
            'content': msg.content,
            'created_at': msg.created_at.isoformat(),
            'message_metadata': msg.message_metadata
        } for msg in messages]
    })

@app.route('/api/chats/<int:chat_id>', methods=['PUT'])
@login_required
def update_chat(chat_id):
    chat = Chat.query.filter_by(id=chat_id, user_id=session['user_id']).first_or_404()
    data = request.get_json()
    new_title = data.get('title', '').strip()
    
    if not new_title:
        return jsonify({'error': 'Title cannot be empty'}), 400
        
    chat.title = new_title
    db.session.commit()
    
    return jsonify({
        'id': chat.id,
        'title': chat.title,
        'created_at': chat.created_at.isoformat()
    })

@app.route('/api/chats/<int:chat_id>', methods=['DELETE'])
@login_required
def delete_chat(chat_id):
    chat = Chat.query.filter_by(id=chat_id, user_id=session['user_id']).first_or_404()
    
    # Delete all messages first
    Message.query.filter_by(chat_id=chat_id).delete()
    
    # Then delete the chat
    db.session.delete(chat)
    db.session.commit()
    
    return jsonify({'message': 'Chat deleted successfully'})

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'})
    
    file = request.files['file']
    message = request.form.get('message', '')
    model = request.form.get('model', 'grok')
    chat_id = request.form.get('chat_id')
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'})
        
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Tạo chat mới nếu chưa có chat_id
        if not chat_id:
            chat = Chat(
                title=f"Phân tích file: {filename}",
                user_id=session['user_id']
            )
            db.session.add(chat)
            db.session.commit()
            chat_id = chat.id
        else:
            chat = Chat.query.get(chat_id)
        
        # Xác định MIME type
        mime_type = "application/pdf"
        if filename.lower().endswith(('.jpg', '.jpeg')):
            mime_type = "image/jpeg"
        elif filename.lower().endswith('.png'):
            mime_type = "image/png"
        elif filename.lower().endswith('.gif'):
            mime_type = "image/gif"
        
        # Trích xuất nội dung file nếu có thể
        file_content = None
        file_size = os.path.getsize(file_path)
        
        try:
            if filename.lower().endswith('.pdf'):
                import PyPDF2
                with open(file_path, 'rb') as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    content = ""
                    for page_num in range(len(pdf_reader.pages)):
                        content += pdf_reader.pages[page_num].extract_text() + "\n\n"
                    file_content = content
        except Exception as e:
            print(f"Error extracting content: {str(e)}")
            file_content = "Không thể trích xuất nội dung từ file PDF."
        
        # Lưu thông tin file vào database
        db_file = UploadedFile(
            filename=filename,
            original_filename=file.filename,
            file_path=file_path,
            mime_type=mime_type,
            file_size=file_size,
            file_content=file_content,
            chat_id=chat_id,
            user_id=session['user_id']
        )
        db.session.add(db_file)
        
        # Cập nhật metadata của chat
        if not chat.chat_metadata:
            chat.chat_metadata = {}
        
        chat.chat_metadata['last_file'] = {
            'id': db_file.id,
            'filename': file.filename,
            'mime_type': mime_type,
            'upload_time': datetime.utcnow().isoformat()
        }
        db.session.commit()
        
        # Lưu tin nhắn của user
        user_message = Message(
            content=f"Đã upload file {file.filename}. Yêu cầu: {message}",
            role='user',
            chat_id=chat_id,
            message_metadata={'file_id': db_file.id}
        )
        db.session.add(user_message)
        db.session.commit()
        
        # Đọc file dưới dạng binary và mã hóa base64 để gửi cho API
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
        
        import base64
        encoded_file = base64.b64encode(file_bytes).decode('utf-8')
        
        # Xử lý tùy theo model
        ai_response = ""
        try:
            if model == 'gemini':
                # Gửi request đến Gemini API với file base64
                response = requests.post(
                    f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                    headers={
                        'Content-Type': 'application/json'
                    },
                    json={
                        "contents": [{
                            "parts": [
                                {"text": f"Yêu cầu: {message}"},
                                {
                                    "inlineData": {
                                        "mimeType": mime_type,
                                        "data": encoded_file
                                    }
                                }
                            ]
                        }],
                        "generationConfig": {
                            "temperature": 1.0,
                            "topP": 0.95,
                            "maxOutputTokens": 8192
                        }
                    },
                    timeout=60
                )
                
                response.raise_for_status()
                result_json = response.json()
                
                # Xử lý response theo định dạng API v1beta
                if "candidates" in result_json and len(result_json["candidates"]) > 0:
                    candidate = result_json["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        ai_response = candidate["content"]["parts"][0]["text"]
                    else:
                        ai_response = "Không thể tìm thấy nội dung phản hồi trong kết quả API."
                else:
                    ai_response = "Không thể tìm thấy phản hồi từ API."
                
            else:  # Grok
                # Grok API cũng hỗ trợ xử lý hình ảnh và PDF
                response = requests.post(
                    GROK_API_URL,
                    headers={
                        'Authorization': f'Bearer {GROK_API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'messages': [
                            {
                                'role': 'user',
                                'content': [
                                    {
                                        'type': 'text',
                                        'text': f"Đây là file {file.filename}. Yêu cầu: {message}"
                                    },
                                    {
                                        'type': 'image_url',
                                        'image_url': {
                                            'url': f"data:{mime_type};base64,{encoded_file}"
                                        }
                                    }
                                ]
                            }
                        ],
                        'model': 'grok-2-latest',
                        'stream': False,
                        'temperature': 1.0
                    }
                )
                response.raise_for_status()
                ai_response = response.json()['choices'][0]['message']['content']
                
        except Exception as e:
            print(f"Error processing file with API: {str(e)}")
            ai_response = f"Lỗi khi xử lý file: {str(e)}"
        
        # Lưu tin nhắn của AI
        ai_message = Message(
            content=ai_response,
            role='assistant',
            chat_id=chat_id,
            message_metadata={'model': model, 'file_id': db_file.id}
        )
        db.session.add(ai_message)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'response': ai_response,
            'chat_id': chat_id
        })
    
    return jsonify({'error': 'File type not allowed'})

@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
@login_required
def add_message(chat_id):
    data = request.get_json()
    message = data.get('message', '').strip()
    model = data.get('model', 'grok')
    
    if not message:
        return jsonify({'error': 'Message cannot be empty'}), 400
    
    # Kiểm tra chat
    chat = Chat.query.filter_by(id=chat_id, user_id=session['user_id']).first_or_404()
    
    # Lưu tin nhắn của user
    user_message = Message(
        chat_id=chat_id, 
        role='user', 
        content=message,
        message_metadata={}
    )
    db.session.add(user_message)
    db.session.commit()
    
    # Chuẩn bị context cho AI
    chat_history = []
    
    # Kiểm tra xem chat này có file đã upload không
    latest_file = None
    file_content = None
    
    # Lấy từ chat metadata
    if chat.chat_metadata and 'last_file' in chat.chat_metadata:
        file_id = chat.chat_metadata['last_file'].get('id')
        if file_id:
            latest_file = UploadedFile.query.get(file_id)
    
    # Nếu không có trong metadata, tìm từ database
    if not latest_file:
        latest_file = UploadedFile.query.filter_by(chat_id=chat_id).order_by(UploadedFile.created_at.desc()).first()
    
    # Nếu có file, thêm thông tin file vào context
    if latest_file:
        system_message = f"Trong cuộc trò chuyện này, người dùng đã upload file '{latest_file.original_filename}' (loại: {latest_file.mime_type})."
        
        if latest_file.file_content:
            # Giới hạn nội dung để tránh quá dài
            file_content_preview = latest_file.file_content[:5000]
            if len(latest_file.file_content) > 5000:
                file_content_preview += "... (nội dung đã được cắt ngắn)"
                
            system_message += f"\n\nNội dung file:\n{file_content_preview}"
        
        chat_history.append({
            'role': 'system',
            'content': system_message
        })
    
    # Lấy lịch sử chat gần đây
    recent_messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.created_at.desc()).limit(20).all()
    recent_messages.reverse()  # Đảo ngược để có thứ tự thời gian đúng
    
    for msg in recent_messages:
        if msg.role not in ['system', 'user', 'assistant']:
            continue
        chat_history.append({'role': msg.role, 'content': msg.content})
    
    # Gọi API AI tùy theo model
    ai_response = ""
    try:
        if model == 'gemini':
            # Chuẩn bị nội dung cho Gemini API
            gemini_content = []
            system_info = ""
            
            # Tìm tin nhắn hệ thống (thông tin file)
            for msg in chat_history:
                if msg['role'] == 'system':
                    system_info += msg['content'] + "\n\n"
            
            # Kết hợp thông tin hệ thống và lịch sử chat
            latest_messages = []
            for msg in chat_history[-5:]:  # Lấy 5 tin nhắn gần nhất
                if msg['role'] != 'system':
                    latest_messages.append(msg)
            
            # Thêm context từ file (nếu có) vào prompt
            prompt = ""
            if system_info:
                prompt = f"{system_info}\n\n"
            
            # Thêm lịch sử chat gần đây
            for msg in latest_messages:
                if msg['role'] == 'user':
                    prompt += f"Người dùng: {msg['content']}\n"
                elif msg['role'] == 'assistant':
                    prompt += f"Trợ lý: {msg['content']}\n"
            
            gemini_content.append({
                "parts": [{"text": prompt}]
            })
            
            response = requests.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                headers={
                    'Content-Type': 'application/json'
                },
                json={
                    "contents": gemini_content,
                    "generationConfig": {
                        "temperature": 1.0,
                        "topP": 0.95,
                        "maxOutputTokens": 8192
                    }
                },
                timeout=30
            )
            
            response.raise_for_status()
            result_json = response.json()
            
            # Xử lý response
            if "candidates" in result_json and len(result_json["candidates"]) > 0:
                candidate = result_json["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    ai_response = candidate["content"]["parts"][0]["text"]
                else:
                    ai_response = "Không thể tìm thấy nội dung phản hồi trong kết quả API."
            else:
                ai_response = "Không thể tìm thấy phản hồi từ API."
        
        else:  # Grok
            response = requests.post(
                GROK_API_URL,
                headers={
                    'Authorization': f'Bearer {GROK_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'messages': chat_history,
                    'model': 'grok-2-latest',
                    'stream': False,
                    'temperature': 1.0
                }
            )
            response.raise_for_status()
            ai_response = response.json()['choices'][0]['message']['content']
    
    except Exception as e:
        print(f"Error calling AI API: {str(e)}")
        ai_response = f"Lỗi khi gọi API: {str(e)}"
    
    # Lưu tin nhắn của AI
    ai_message = Message(
        chat_id=chat_id, 
        role='assistant', 
        content=ai_response, 
        message_metadata={'model': model}
    )
    db.session.add(ai_message)
    db.session.commit()
    
    return jsonify({
        'response': ai_response,
        'chat_id': chat_id,
        'model': model
    })
@app.route('/api/chats/<int:chat_id>/files', methods=['GET'])
@login_required
def get_chat_files(chat_id):
    files = UploadedFile.query.filter_by(chat_id=chat_id).order_by(UploadedFile.created_at.desc()).all()
    return jsonify([{
        'id': file.id,
        'filename': file.original_filename,
        'mime_type': file.mime_type,
        'created_at': file.created_at.isoformat()
    } for file in files])
if __name__ == '__main__':
    app.run(debug=True)


