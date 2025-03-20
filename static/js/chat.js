let currentChatId = null;
let currentModel = 'grok';

// Hàm xử lý thay đổi model
function changeModel(modelName) {
    currentModel = modelName;
    
    // Thêm hiệu ứng chuyển đổi model
    const chatBox = document.getElementById('chatBox');
    chatBox.classList.add('model-change-animation');
    
    // Thông báo cho người dùng về việc đã chuyển model
    addSystemMessage(`Đã chuyển sang sử dụng ${modelName.toUpperCase()}`);
    
    // Xóa class animation sau khi hoàn thành
    setTimeout(() => {
        chatBox.classList.remove('model-change-animation');
    }, 1000);
}

// Hàm thêm tin nhắn hệ thống
function addSystemMessage(content) {
    const chatBox = document.getElementById('chatBox');
    
    const messageGroup = document.createElement('div');
    messageGroup.classList.add('message-group', 'bot-message');
    
    // Tạo header
    const messageHeader = document.createElement('div');
    messageHeader.classList.add('message-header');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = 'SYS';
    
    const messageRole = document.createElement('div');
    messageRole.classList.add('message-role');
    messageRole.textContent = 'SYSTEM';
    
    messageHeader.appendChild(avatar);
    messageHeader.appendChild(messageRole);
    messageGroup.appendChild(messageHeader);
    
    // Tạo content
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    messageGroup.appendChild(messageDiv);
    chatBox.appendChild(messageGroup);
    
    // Scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}
// Hàm tự động điều chỉnh kích thước textarea
function autoResize(textarea) {
    // Reset chiều cao về auto để tính toán chính xác
    textarea.style.height = 'auto';
    
    // Set chiều cao mới dựa trên scrollHeight
    textarea.style.height = textarea.scrollHeight + 'px';
    
    // Enable/disable nút gửi dựa trên nội dung
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
        sendButton.disabled = textarea.value.trim() === '';
    }
}

// Load danh sách chat khi trang được tải
document.addEventListener('DOMContentLoaded', async function() {
    await loadChatList();
    
    // Thêm event listener cho phím Enter
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                e.preventDefault(); // Chặn Enter tạo dòng mới
                sendMessage();
            }
        });
    }

    // Gộp logic khởi tạo hiệu ứng nền vào đây để tránh nhiều listener
    startBackgroundEffect();
});

// Load danh sách chat
async function loadChatList() {
    try {
        const response = await fetch('/api/chats');
        const chats = await response.json();
        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '';
        
        chats.forEach(chat => {
            const chatItem = createChatListItem(chat);
            chatList.appendChild(chatItem);
        });
        
        // Load chat đầu tiên nếu có
        if (chats.length > 0) {
            await loadChat(chats[0].id);
        }
    } catch (error) {
        console.error('Error loading chat list:', error);
    }
}

// Tạo chat mới
async function createNewChat() {
    try {
        const response = await fetch('/api/chats', {
            method: 'POST'
        });
        const chat = await response.json();
        const chatList = document.getElementById('chatList');
        const chatItem = createChatListItem(chat);
        chatList.insertBefore(chatItem, chatList.firstChild);
        
        // Load chat mới và xóa tin nhắn mặc định
        await loadChat(chat.id);
        const chatBox = document.getElementById('chatBox');
        chatBox.innerHTML = '';
    } catch (error) {
        console.error('Error creating new chat:', error);
    }
}

// Tạo chat item cho treelist
function createChatListItem(chat) {
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.dataset.chatId = chat.id;
    chatItem.onclick = () => loadChat(chat.id);
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'chat-item-title-container';
    
    const title = document.createElement('div');
    title.className = 'chat-item-title';
    title.textContent = chat.title;
    title.setAttribute('contenteditable', 'false'); // Ban đầu không cho phép chỉnh sửa
    
    // Xử lý sự kiện khi người dùng hoàn tất chỉnh sửa
    title.addEventListener('blur', function() {
        if (title.classList.contains('editing')) {
            title.classList.remove('editing');
            title.setAttribute('contenteditable', 'false');
            
            // Lưu title mới nếu có thay đổi
            const newTitle = title.textContent.trim();
            if (newTitle !== chat.title && newTitle !== '') {
                updateChatTitle(chat.id, newTitle, title);
            } else {
                title.textContent = chat.title; // Khôi phục title cũ nếu trống
            }
        }
    });
    
    // Xử lý khi người dùng nhấn Enter
    title.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            title.blur(); // Kết thúc chỉnh sửa
        }
    });
    
    const actions = document.createElement('div');
    actions.className = 'chat-item-actions';
    
    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename-btn';
    renameBtn.innerHTML = '<span class="material-icons">edit</span>';
    renameBtn.onclick = (e) => {
        e.stopPropagation();
        // Bật chế độ chỉnh sửa trực tiếp
        title.setAttribute('contenteditable', 'true');
        title.classList.add('editing');
        title.focus();
        
        // Đặt con trỏ vào cuối text
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(title);
        range.collapse(false); // false = collapse to end
        sel.removeAllRanges();
        sel.addRange(range);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteChat(chat.id, chatItem);
    };
    
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    titleContainer.appendChild(title);
    titleContainer.appendChild(actions);
    
    const date = document.createElement('div');
    date.className = 'chat-item-date';
    date.textContent = new Date(chat.created_at).toLocaleString();
    
    chatItem.appendChild(titleContainer);
    chatItem.appendChild(date);
    
    return chatItem;
}

// Hàm mới để cập nhật title chat
// Hàm cập nhật tiêu đề chat
async function updateChatTitle(message) {
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${currentChatId}"]`);
    if (chatItem) {
        const titleElement = chatItem.querySelector('.chat-item-title');
        if (titleElement) {
            // Tạo tiêu đề từ nội dung tin nhắn
            const newTitle = message.slice(0, 50) + (message.length > 50 ? '...' : '');
            
            try {
                const response = await fetch(`/api/chats/${currentChatId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ title: newTitle })
                });
                
                if (response.ok) {
                    titleElement.textContent = newTitle;
                    // Thêm hiệu ứng thành công
                    titleElement.style.color = '#00ffcc';
                    setTimeout(() => {
                        titleElement.style.color = '';
                    }, 1000);
                } else {
                    throw new Error('Failed to rename chat');
                }
            } catch (error) {
                console.error('Error renaming chat:', error);
                // Thêm hiệu ứng lỗi
                titleElement.style.color = '#ff004c';
                setTimeout(() => {
                    titleElement.style.color = '';
                }, 1000);
            }
        }
    }
}
// Load chat cụ thể
async function loadChat(chatId) {
    try {
        currentChatId = chatId;
        const response = await fetch(`/api/chats/${chatId}`);
        const chat = await response.json();
        
        // Update active state in chat list
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === chatId);
        });
        
        // Clear current chat
        const chatBox = document.getElementById('chatBox');
        chatBox.innerHTML = '';
        
        // Load messages from database
        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(message => {
                // Nếu tin nhắn có metadata và có thông tin model
                const model = message.message_metadata && message.message_metadata.model 
                    ? message.message_metadata.model 
                    : 'grok';
                    
                addMessage(message.role, message.content, model);
            });
        }
    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

// Sửa lại hàm sendMessage để lưu tin nhắn vào database
async function sendMessage() {
    // Nếu đang trong quá trình gửi, bỏ qua yêu cầu gửi mới
    if (isSending) {
        console.log("Đang gửi tin nhắn, bỏ qua yêu cầu mới");
        return;
    }
    
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    
    if (message !== '') {
        // Đánh dấu đang gửi tin nhắn
        isSending = true;
        
        try {
            // Xóa nội dung input
            document.getElementById('userInput').value = '';
            autoResize(document.getElementById('userInput'));
            
            // Kiểm tra xem có file đã upload không
            if (hasUploadedFile && uploadedFile) {
                // Tạo tin nhắn hiển thị file và prompt
                let fileDisplayMessage = `Đã upload file: ${uploadedFile.name}\n\nYêu cầu: ${message}`;
                
                // Hiển thị tin nhắn của user kèm thông tin file
                addMessage('user', fileDisplayMessage);
                
                // Xóa thông báo file notification
                const fileNotification = document.querySelector('.file-notification');
                if (fileNotification) {
                    fileNotification.remove();
                }
                
                // Thêm hiệu ứng "đang suy nghĩ..."
                addThinkingIndicator();
                
                // Upload file lên server
                const formData = new FormData();
                formData.append('file', uploadedFile.file);
                formData.append('message', message);
                formData.append('model', currentModel);
                
                // Thêm chat_id nếu có
                if (currentChatId) {
                    formData.append('chat_id', currentChatId);
                }
                
                try {
                    const uploadResponse = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const uploadData = await uploadResponse.json();
                    
                    // Xóa hiệu ứng "đang suy nghĩ..."
                    removeThinkingIndicator();
                    
                    if (uploadData.success) {
                        // Cập nhật chat_id nếu đã tạo chat mới
                        if (uploadData.chat_id && (!currentChatId || currentChatId !== uploadData.chat_id)) {
                            currentChatId = uploadData.chat_id;
                            // Cập nhật UI nếu cần
                            await loadChatList();
                        }
                        
                        // Hiển thị phản hồi từ AI
                        addModelResponse(uploadData.response);
                    } else {
                        // Hiển thị thông báo lỗi
                        addSystemMessage(`Lỗi: ${uploadData.error || 'Không thể xử lý file'}`);
                    }
                } catch (error) {
                    console.error('Error processing file:', error);
                    removeThinkingIndicator();
                    addSystemMessage(`Lỗi kết nối: ${error.message}`);
                }
                
                // Reset trạng thái upload
                hasUploadedFile = false;
                uploadedFile = null;
            } else {
                // Xử lý tin nhắn thông thường
                
                // Hiển thị tin nhắn của user trước
                addMessage('user', message);
                
                // Thêm hiệu ứng "đang suy nghĩ..."
                addThinkingIndicator();
                
                const response = await fetch(`/api/chats/${currentChatId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        message: message,
                        model: currentModel
                    })
                });
                
                const data = await response.json();
                
                // Xóa hiệu ứng "đang suy nghĩ..."
                removeThinkingIndicator();
                
                // Hiển thị phản hồi từ AI
                addModelResponse(data.response);
                
                // Cập nhật title trong chat list
                updateChatTitle(message);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Xóa hiệu ứng "đang suy nghĩ..." nếu có lỗi
            removeThinkingIndicator();
            addSystemMessage(`Đã xảy ra lỗi: ${error.message}`);
        } finally {
            // Đánh dấu đã hoàn thành gửi tin nhắn
            isSending = false;
        }
    }
}

// Hàm thêm hiệu ứng "đang suy nghĩ..."
function addThinkingIndicator() {
    const chatBox = document.getElementById('chatBox');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = 'ai-thinking';
    thinkingDiv.className = 'message-group bot-message';
    
    // Thêm class dựa trên model hiện tại
    thinkingDiv.classList.add(`${currentModel}-message`);
    
    thinkingDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${currentModel === 'grok' ? 'AI' : 'AI'}</div>
            <div class="message-role">${currentModel.toUpperCase()}</div>
        </div>
        <div class="message">
            <div class="message-content">
                <div style="display: flex; align-items: center; gap: 8px;">
                    Thinking
                    <div style="display: flex; gap: 3px;">
                        <div style="width: 6px; height: 6px; background-color: ${currentModel === 'grok' ? '#00ffcc' : '#4285F4'}; border-radius: 50%; 
                            animation: pulse 0.6s infinite alternate;"></div>
                        <div style="width: 6px; height: 6px; background-color: ${currentModel === 'grok' ? '#00ffcc' : '#4285F4'}; border-radius: 50%; 
                            animation: pulse 0.6s 0.2s infinite alternate;"></div>
                        <div style="width: 6px; height: 6px; background-color: ${currentModel === 'grok' ? '#00ffcc' : '#4285F4'}; border-radius: 50%; 
                            animation: pulse 0.6s 0.4s infinite alternate;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    chatBox.appendChild(thinkingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Hàm xóa hiệu ứng "đang suy nghĩ..."
function removeThinkingIndicator() {
    const thinkingElement = document.getElementById('ai-thinking');
    if (thinkingElement) {
        thinkingElement.remove();
    }
}
function addModelResponse(responseText) {
    const chatBox = document.getElementById('chatBox');
    responseText = responseText.replace(/&quot;/g, '"');

    // Tạo phần tử tin nhắn AI
    const messageGroup = document.createElement('div');
    messageGroup.classList.add('message-group', 'bot-message');
    
    // Thêm class dựa trên model đã sử dụng
    messageGroup.classList.add(`${currentModel}-message`);
    
    // Tạo header
    const messageHeader = document.createElement('div');
    messageHeader.classList.add('message-header');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = currentModel === 'grok' ? 'AI' : 'AI';
    
    const messageRole = document.createElement('div');
    messageRole.classList.add('message-role');
    messageRole.textContent = currentModel.toUpperCase();
    
    messageHeader.appendChild(avatar);
    messageHeader.appendChild(messageRole);
    messageGroup.appendChild(messageHeader);
    
    // Tạo content
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    // Thêm hiệu ứng Cyber
    addCyberEffect(contentDiv);
    
    messageDiv.appendChild(contentDiv);
    messageGroup.appendChild(messageDiv);
    chatBox.appendChild(messageGroup);
    
    // Áp dụng hiệu ứng chữ chạy
    applyTypingEffect(contentDiv, responseText);
    
    // Phát âm thanh phản hồi
    playResponseSound();
    
    // Scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
}

let hasUploadedFile = false;
let uploadedFile = null;
function previewFile(input) {
    const file = input.files[0];
    if (file) {
        const fileType = file.type;
        const chatBox = document.getElementById('chatBox');
        
        // Lưu thông tin file đã upload vào biến global để sử dụng sau
        uploadedFile = {
            file: file,
            type: fileType,
            name: file.name
        };
        
        // Hiển thị thông báo đã upload file thành công
        const notificationDiv = document.createElement('div');
        notificationDiv.classList.add('file-notification');
        notificationDiv.innerHTML = `
            <div class="file-preview">
                <span class="material-icons">${fileType.startsWith('image/') ? 'image' : 'description'}</span>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                </div>
            </div>
        `;
        
        // Thêm thông báo vào dưới khung nhập liệu
        const inputArea = document.querySelector('.input-area');
        const existingNotification = document.querySelector('.file-notification');
        
        if (existingNotification) {
            existingNotification.remove();
        }
        
        inputArea.insertBefore(notificationDiv, inputArea.firstChild);
        
        // Focus vào ô input để người dùng nhập prompt
        document.getElementById('userInput').focus();
        
        // Đánh dấu là đã có file cần xử lý
        hasUploadedFile = true;
    }
}

// Load lịch sử chat khi trang được tải
document.addEventListener('DOMContentLoaded', function() {
    // Thêm animation cho nền
    startBackgroundEffect();
});

function startBackgroundEffect() {
    document.body.style.animation = 'backgroundPulse 10s infinite alternate';
}

function addCyberEffect(element) {
    // Thêm hiệu ứng border glowing
    element.style.border = '1px solid transparent';
}

function playMessageSound() {
    // Tạo âm thanh gửi tin nhắn
    const audio = new Audio();
    audio.volume = 0.3;
    audio.src = 'data:audio/mp3;base64,SUQzAwAAAAAfdlRJVDIAAAAZAAAASW50ZXJuZXQgU291bmQgRWZmZWN0cwBUSVQzAAAAGQAAAEludGVybmV0IFNvdW5kIEVmZmVjdHMAVFhYWAAAABkAAABJbnRlcm5ldCBTb3VuZCBFZmZlY3RzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQwAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
    audio.play();
}

function playResponseSound() {
    // Tạo âm thanh nhận tin nhắn
    const audio = new Audio();
    audio.volume = 0.3;
    audio.src = 'data:audio/mp3;base64,SUQzAwAAAAAfdlRJVDIAAAAZAAAASW50ZXJuZXQgU291bmQgRWZmZWN0cwBUSVQzAAAAGQAAAEludGVybmV0IFNvdW5kIEVmZmVjdHMAVFhYWAAAABkAAABJbnRlcm5ldCBTb3VuZCBFZmZlY3RzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQwAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
    audio.play();
}
// Hàm tạo hiệu ứng chữ chạy từng ký tự
function applyTypingEffect(element, text) {
    const formattedText = formatCyberMarkdown(text);
    element.innerHTML = ''; // Xóa nội dung hiện tại
    
    let index = 0;
    const typingSpeed = 10; // Tốc độ chữ chạy (ms)
    
    function typeNextChar() {
        if (index < formattedText.length) {
            let char = formattedText.charAt(index);
            
            // Nếu gặp tag HTML, xử lý đặc biệt
            if (char === '<') {
                // Tìm tag kết thúc
                let endIndex = formattedText.indexOf('>', index) + 1;
                if (endIndex > index) {
                    let htmlTag = formattedText.substring(index, endIndex);
                    element.innerHTML += htmlTag;
                    
                    // Nếu là tag mở của phần tử quan trọng
                    if (htmlTag.includes('<table') || htmlTag.includes('<pre') || 
                        htmlTag.includes('<div class="table-container"') || 
                        htmlTag.includes('<div class="code-block-wrapper"')) {
                        
                        // Tìm tag đóng tương ứng để lấy toàn bộ phần tử
                        let closingTagName = '';
                        if (htmlTag.includes('<table')) closingTagName = '</table>';
                        else if (htmlTag.includes('<pre')) closingTagName = '</pre>';
                        else if (htmlTag.includes('<div class="table-container"')) closingTagName = '</div>';
                        else if (htmlTag.includes('<div class="code-block-wrapper"')) closingTagName = '</div>';
                        
                        if (closingTagName !== '') {
                            // Tìm vị trí đóng, tính cả các phần tử lồng nhau
                            let depth = 1;
                            let searchStartIndex = endIndex;
                            let currentSearchIndex = searchStartIndex;
                            
                            while (depth > 0 && currentSearchIndex < formattedText.length) {
                                // Tìm tag mở tiếp theo
                                let nextOpenTagIndex = formattedText.indexOf('<' + closingTagName.substring(2), currentSearchIndex);
                                // Tìm tag đóng tiếp theo
                                let nextCloseTagIndex = formattedText.indexOf(closingTagName, currentSearchIndex);
                                
                                // Nếu không tìm thấy tag mở nhưng có tag đóng
                                if (nextOpenTagIndex === -1 && nextCloseTagIndex !== -1) {
                                    depth--;
                                    currentSearchIndex = nextCloseTagIndex + closingTagName.length;
                                }
                                // Nếu tìm thấy tag mở trước tag đóng
                                else if (nextOpenTagIndex !== -1 && nextOpenTagIndex < nextCloseTagIndex) {
                                    depth++;
                                    currentSearchIndex = nextOpenTagIndex + 1;
                                }
                                // Nếu tìm thấy tag đóng trước tag mở
                                else if (nextCloseTagIndex !== -1) {
                                    depth--;
                                    currentSearchIndex = nextCloseTagIndex + closingTagName.length;
                                }
                                // Không tìm thấy tag nào
                                else {
                                    break;
                                }
                            }
                            
                            // Nếu tìm thấy thẻ đóng
                            if (depth === 0) {
                                // Lấy toàn bộ nội dung phần tử
                                const fullElement = formattedText.substring(index, currentSearchIndex);
                                element.innerHTML = element.innerHTML.substring(0, element.innerHTML.length - htmlTag.length) + fullElement;
                                
                                // Áp dụng styles ngay lập tức
                                applyTableStyles();
                                
                                // Cập nhật index
                                index = currentSearchIndex;
                                
                                // Xử lý tiếp phần tử tiếp theo
                                setTimeout(typeNextChar, typingSpeed * 3); // Tạm dừng lâu hơn để người dùng thấy phần tử
                                return;
                            }
                        }
                    }
                    
                    // Nếu là thẻ đóng của một phần tử quan trọng
                    if (htmlTag.includes('</table>') || htmlTag.includes('</pre>') || 
                        (htmlTag.includes('</div>') && element.innerHTML.includes('table-container')) ||
                        (htmlTag.includes('</div>') && element.innerHTML.includes('code-block-wrapper'))) {
                        
                        // Áp dụng styles ngay lập tức
                        applyTableStyles();
                    }
                    
                    index = endIndex;
                } else {
                    // Trường hợp không tìm thấy '>'
                    element.innerHTML += char;
                    index++;
                }
            } else {
                // Trường hợp ký tự thông thường
                element.innerHTML += char;
                index++;
            }
            
            // Scroll xuống khi đang chạy chữ
            const chatBox = document.getElementById('chatBox');
            if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            
            setTimeout(typeNextChar, typingSpeed);
        }
    }
    
    typeNextChar();
}
// Hàm thêm tin nhắn vào chat box
function addMessage(role, content, model = 'grok') {
    const chatBox = document.getElementById('chatBox');
    
    const messageGroup = document.createElement('div');
    messageGroup.classList.add('message-group');
    
    if (role === 'user') {
        messageGroup.classList.add('user-message');
    } else {
        messageGroup.classList.add('bot-message');
        messageGroup.classList.add(`${model}-message`);
    }
    
    // Tạo header
    const messageHeader = document.createElement('div');
    messageHeader.classList.add('message-header');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    
    if (role === 'user') {
        avatar.textContent = 'U';
    } else {
        avatar.textContent = model === 'grok' ? 'AI' : 'AI';
    }
    
    const messageRole = document.createElement('div');
    messageRole.classList.add('message-role');
    messageRole.textContent = role === 'user' ? 'Admin' : model.toUpperCase();
    
    messageHeader.appendChild(avatar);
    messageHeader.appendChild(messageRole);
    messageGroup.appendChild(messageHeader);
    
    // Tạo content
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    // Thêm dataset để theo dõi trạng thái định dạng
    contentDiv.dataset.original = content;
    contentDiv.dataset.formatted = 'false';
    
    // Sử dụng textContent để tránh các vấn đề với HTML không mong muốn
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    messageGroup.appendChild(messageDiv);
    chatBox.appendChild(messageGroup);
    
    // Định dạng ngay lập tức
    contentDiv.innerHTML = formatCyberMarkdown(content);
    contentDiv.dataset.formatted = 'true';
    
    // Scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
    
    // Thêm âm thanh
    if (role === 'user') {
        playMessageSound();
    } else {
        playResponseSound();
    }
}

// Hàm xử lý markdown với phong cách cyber
function formatCyberMarkdown(text) {
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/"([^"]+)"(?![^<]*>)/g, '<strong>"$1"</strong>');

    // Cấu hình marked để sử dụng Prism
    marked.setOptions({
        highlight: function(code, lang) {
            // Kiểm tra xem ngôn ngữ có được Prism hỗ trợ không
            if (Prism.languages[lang]) {
                return Prism.highlight(code, Prism.languages[lang], lang);
            }
            // Trả về code gốc nếu không có syntax highlight
            return code;
        }
    });

    // Sử dụng marked để parse markdown
    let htmlContent = marked.parse(text);

    // Thêm các class tùy chỉnh và hiệu ứng cyber
    htmlContent = htmlContent.replace(
        /<pre><code class="language-(\w+)">/g, 
        '<div class="code-block-wrapper">' +
        '<div class="code-header">' +
        '<span class="code-label">$1</span>' +
        '<button class="copy-btn" onclick="copyCode(this)">' +
        '<span class="material-icons">content_copy</span>' +
        '</button>' +
        '</div>' +
        '<pre><code class="language-$1 cyber-code">'
    );

    // Đóng thẻ wrapper
    htmlContent = htmlContent.replace(
        /<\/code><\/pre>/g, 
        '</code></pre></div>'
    );

    return htmlContent;
}

// Thêm hàm copy code
function copyCode(button) {
    const codeBlock = button.closest('.code-block-wrapper');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        // Hiệu ứng copy
        const originalIcon = button.innerHTML;
        button.innerHTML = '<span class="material-icons">check</span>';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Biến để theo dõi trạng thái gửi tin nhắn
let isSending = false;

// Hàm đổi tên chat
async function renameChat(chatId, titleElement) {
    const currentTitle = titleElement.textContent;
    const newTitle = prompt('Nhập tên mới cho chat:', currentTitle);
    
    if (newTitle && newTitle !== currentTitle) {
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: newTitle })
            });
            
            if (response.ok) {
                titleElement.textContent = newTitle;
                // Reload chat list để cập nhật UI
                await loadChatList();
            } else {
                throw new Error('Failed to rename chat');
            }
        } catch (error) {
            console.error('Error renaming chat:', error);
            alert('Không thể đổi tên chat. Vui lòng thử lại.');
        }
    }
}

// Hàm xóa chat
async function deleteChat(chatId, chatElement) {
    if (confirm('Bạn có chắc muốn xóa chat này?')) {
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // Xóa element khỏi UI
                chatElement.remove();
                
                // Nếu đang ở chat bị xóa, tạo chat mới
                if (currentChatId === chatId) {
                    await createNewChat();
                }
            } else {
                throw new Error('Failed to delete chat');
            }
        } catch (error) {
            console.error('Error deleting chat:', error);
            alert('Không thể xóa chat. Vui lòng thử lại.');
        }
    }
}
// Thêm hàm này vào file chat.js
function applyTableStyles() {
    const tables = document.querySelectorAll('.message-content table');
    tables.forEach(table => {
        // Áp dụng style trực tiếp để đảm bảo hiển thị
        table.style.border = '1px solid #00ffcc';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.margin = '15px 0';
        table.style.background = 'rgba(0, 0, 0, 0.3)';
        
        const cells = table.querySelectorAll('th, td');
        cells.forEach(cell => {
            cell.style.border = '1px solid #00ffcc';
            cell.style.padding = '10px';
        });
        
        const headers = table.querySelectorAll('th');
        headers.forEach(header => {
            header.style.backgroundColor = 'rgba(0, 255, 204, 0.2)';
            header.style.color = '#00ffcc';
        });
    });
}
// Thêm vào đầu file hoặc sau khi tải thư viện marked
document.addEventListener('DOMContentLoaded', function() {
    // Cấu hình marked
    marked.setOptions({
        breaks: true,  // Chuyển xuống dòng
        gfm: true,     // GitHub flavored markdown, hỗ trợ bảng
        tables: true,  // Hỗ trợ bảng
        headerIds: false,
        mangle: false, // Không thay đổi các ký tự đặc biệt trong văn bản
        sanitize: false // Không sanitize HTML (cẩn thận với XSS)
    });
});
// Thêm hiệu ứng keyframe cho body
document.head.insertAdjacentHTML('beforeend', `
<style>
@keyframes borderGlow {
0% { box-shadow: 0 0 5px rgba(0, 255, 204, 0.5); }
50% { box-shadow: 0 0 15px rgba(255, 0, 255, 0.7); }
100% { box-shadow: 0 0 5px rgba(0, 255, 204, 0.5); }
}

@keyframes backgroundPulse {
0% { background: linear-gradient(135deg, #1a1a1a, #2b0045); }
50% { background: linear-gradient(135deg, #1e0030, #230050); }
100% { background: linear-gradient(135deg, #1a1a1a, #2b0045); }
}

@keyframes errorGlitch {
0% { text-shadow: 2px 0 0 rgba(255, 0, 0, 0.7), -2px 0 0 rgba(0, 255, 255, 0.7); }
25% { text-shadow: -2px 0 0 rgba(255, 0, 0, 0.7), 2px 0 0 rgba(0, 255, 255, 0.7); }
50% { text-shadow: 0 0 5px rgba(255, 0, 0, 0.7); }
75% { text-shadow: 2px 2px 0 rgba(255, 0, 0, 0.7), -2px -2px 0 rgba(0, 255, 255, 0.7); }
100% { text-shadow: 2px 0 0 rgba(255, 0, 0, 0.7), -2px 0 0 rgba(0, 255, 255, 0.7); }
}

@keyframes deleteFade {
0% { opacity: 1; transform: scale(1); }
30% { opacity: 0.7; transform: scale(1.02) skewX(5deg); }
100% { opacity: 0; transform: scale(0); height: 0; margin: 0; padding: 0; }
}

/* Loading indicator animation */
.typing-indicator {
display: flex;
align-items: center;
justify-content: flex-start;
}

.typing-indicator span {
height: 8px;
width: 8px;
margin: 0 2px;
background-color: #00ffcc;
display: block;
border-radius: 50%;
opacity: 0.4;
}

.typing-indicator span:nth-of-type(1) {
animation: typing 1s infinite 0s;
}

.typing-indicator span:nth-of-type(2) {
animation: typing 1s infinite 0.3s;
}

.typing-indicator span:nth-of-type(3) {
animation: typing 1s infinite 0.6s;
}

@keyframes typing {
0% { transform: scale(1); opacity: 0.4; }
50% { transform: scale(1.4); opacity: 1; }
100% { transform: scale(1); opacity: 0.4; }
}

/* Text glitch effect */
.glitch-text {
animation: textGlitch 0.5s linear;
}

@keyframes textGlitch {
0% { text-shadow: none; }
10% { text-shadow: 1px 1px 0 #00ffcc, -1px -1px 0 #ff00ff; }
20% { text-shadow: -1px 1px 0 #00ffcc, 1px -1px 0 #ff00ff; }
30% { text-shadow: none; }
40% { text-shadow: 1px -1px 0 #00ffcc, -1px 1px 0 #ff00ff; }
50% { text-shadow: none; }
60% { text-shadow: -2px 2px 0 #00ffcc, 2px -2px 0 #ff00ff; }
70% { text-shadow: none; }
80% { text-shadow: 2px 2px 0 #00ffcc, -2px -2px 0 #ff00ff; }
90% { text-shadow: none; }
100% { text-shadow: none; }
}
</style>
`);
