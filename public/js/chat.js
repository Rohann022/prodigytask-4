if (!localStorage.getItem('token')) {
  window.location.href = '/';
}

const token = localStorage.getItem('token');
const socketHost = (location.port === '5500' || location.port === '5501') 
  ? 'http://localhost:5000' 
  : '/';
const apiHost = socketHost === '/' ? '' : 'http://localhost:5000';

console.info('Socket connecting to', socketHost);
const socket = io(socketHost, { auth: { token } });

socket.on('connect_error', (err) => {
  console.error('Socket connect_error', err);
  if (err && err.message && (err.message.includes('Token') || err.message.includes('Invalid'))) {
    alert('Authentication error. Please log in again.');
    localStorage.removeItem('token');
    window.location.href = '/';
  } else {
    alert('Socket connection error: ' + (err && err.message ? err.message : 'Unknown')); 
  }
});

socket.on('connect', () => {
  console.log('✅ Successfully connected to server');
  loadRoomHistory(currentRoom);
});

const msgList = document.getElementById('messages');
const msgInput = document.getElementById('message-input');
const form = document.getElementById('message-form');
const roomList = document.getElementById('room-list');
const newRoomInput = document.getElementById('new-room');
const createRoomBtn = document.getElementById('create-room');
const usersList = document.getElementById('users-list');
const currentRoomTitle = document.getElementById('current-room-title');
const fileInput = document.getElementById('file-input');
const fileBtn = document.getElementById('file-btn');
const filePreview = document.getElementById('file-preview');
const userSearch = document.getElementById('user-search');
const searchResults = document.getElementById('search-results');

let currentRoom = 'general';
let currentDMUser = null;
let isDMMode = false;
let selectedFile = null;
let searchTimeout = null;
const messageHistory = new Map();

socket.emit('chat:join', currentRoom);

// User search functionality
if (userSearch) {
  userSearch.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }
    
    searchTimeout = setTimeout(async () => {
      try {
        const response = await fetch(`${apiHost}/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: {
            'x-auth': token
          }
        });
        
        if (!response.ok) {
          throw new Error('Search failed');
        }
        
        const users = await response.json();
        displaySearchResults(users);
      } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<li class="search-error">Search failed</li>';
        searchResults.style.display = 'block';
      }
    }, 300);
  });
}

// Display search results
function displaySearchResults(users) {
  if (users.length === 0) {
    searchResults.innerHTML = '<li class="no-results">No users found</li>';
    searchResults.style.display = 'block';
    return;
  }
  
  searchResults.innerHTML = users.map(user => `
    <li data-user-id="${user.id}" class="search-result-item">
      <span class="user-name">${escapeHtml(user.name)}</span>
      <span class="user-email">${escapeHtml(user.email)}</span>
    </li>
  `).join('');
  
  searchResults.style.display = 'block';
  
  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.getAttribute('data-user-id');
      const userName = item.querySelector('.user-name').textContent;
      const userEmail = item.querySelector('.user-email').textContent;
      
      startDM({ id: userId, name: userName, email: userEmail });
      
      userSearch.value = '';
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
    });
  });
}

// File button click
fileBtn.addEventListener('click', () => {
  fileInput.click();
});

// File selection
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      fileInput.value = '';
      return;
    }
    selectedFile = file;
    showFilePreview(file);
  }
});

// Show file preview
function showFilePreview(file) {
  const fileSize = (file.size / 1024).toFixed(2);
  const unit = fileSize > 1024 ? 'MB' : 'KB';
  const displaySize = fileSize > 1024 ? (fileSize / 1024).toFixed(2) : fileSize;
  
  filePreview.innerHTML = `
    <div class="file-preview-item">
      <span class="file-icon">${getFileIcon(file.type)}</span>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${displaySize} ${unit}</div>
      </div>
      <button type="button" class="file-remove" onclick="removeFile()">✕</button>
    </div>
  `;
  filePreview.style.display = 'block';
}

// Remove selected file
window.removeFile = function() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.style.display = 'none';
  filePreview.innerHTML = '';
};

// Get file icon based on type
function getFileIcon(mimetype) {
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype.startsWith('video/')) return '🎥';
  if (mimetype.startsWith('audio/')) return '🎵';
  if (mimetype.includes('pdf')) return '📄';
  if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
  if (mimetype.includes('sheet') || mimetype.includes('excel')) return '📊';
  if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return '📽️';
  return '📎';
}

socket.on('chat:msg', (data) => {
  if (data.room !== currentRoom || isDMMode) return;
  
  if (!messageHistory.has(data.room)) {
    messageHistory.set(data.room, []);
  }
  messageHistory.get(data.room).push(data);
  
  displayMessage(data);
});

socket.on('dm:receive', (data) => {
  const { roomId, from } = data;
  
  if (!messageHistory.has(roomId)) {
    messageHistory.set(roomId, []);
  }
  messageHistory.get(roomId).push(data);
  
  if (isDMMode && currentDMUser) {
    const currentDMRoomId = [getUserId(), currentDMUser.id].sort().join('-dm-');
    if (roomId === currentDMRoomId) {
      displayMessage(data);
    } else {
      showNotification(`New message from ${from.name}`);
    }
  } else {
    showNotification(`New message from ${from.name}`);
  }
});

socket.on('history:room', ({ room, messages }) => {
  if (room === currentRoom && !isDMMode) {
    messageHistory.set(room, messages);
    displayHistory(messages);
  }
});

socket.on('history:dm', ({ recipientId, messages }) => {
  if (isDMMode && currentDMUser && currentDMUser.id === recipientId) {
    const dmRoomId = [getUserId(), recipientId].sort().join('-dm-');
    messageHistory.set(dmRoomId, messages);
    displayHistory(messages);
  }
});

socket.on('history:error', ({ error }) => {
  console.error('History error:', error);
  showMessage('Could not load chat history', 'error');
});

socket.on('message:error', ({ error }) => {
  console.error('Message error:', error);
  showMessage(error, 'error');
});

socket.on('dm:invitation', ({ roomId }) => {
  socket.emit('chat:join', roomId);
});

socket.on('users:online', (users) => {
  updateOnlineUsers(users);
});

let typingTimeout;
msgInput.addEventListener('input', () => {
  if (isDMMode && currentDMUser) {
    socket.emit('typing:start', { room: currentDMUser.id });
  } else {
    socket.emit('typing:start', { room: currentRoom });
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (isDMMode && currentDMUser) {
      socket.emit('typing:stop', { room: currentDMUser.id });
    } else {
      socket.emit('typing:stop', { room: currentRoom });
    }
  }, 1000);
});

socket.on('typing:start', ({ user }) => {
  showTypingIndicator(user);
});

socket.on('typing:stop', () => {
  hideTypingIndicator();
});

// Send message (handles both text and files)
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = msgInput.value.trim();
  
  if (!text && !selectedFile) return;

  let attachment = null;

  // Upload file if selected
  if (selectedFile) {
    try {
      const uploadBtn = form.querySelector('button[type="submit"]');
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';
      
      attachment = await uploadFile(selectedFile);
      
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Send';
    } catch (error) {
      console.error('Upload failed:', error);
      showMessage('File upload failed', 'error');
      return;
    }
  }

  if (isDMMode && currentDMUser) {
    socket.emit('dm:send', { 
      recipientId: currentDMUser.id, 
      text: text || undefined,
      attachment 
    });
  } else {
    socket.emit('chat:msg', { 
      room: currentRoom, 
      text: text || undefined,
      attachment 
    });
  }
  
  msgInput.value = '';
  removeFile();
});

// Upload file to server
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiHost}/api/upload`, {
    method: 'POST',
    headers: {
      'x-auth': token
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  return await response.json();
}

roomList.addEventListener('click', (e) => {
  if (e.target.tagName !== 'LI') return;
  const room = e.target.getAttribute('data-room');
  switchRoom(room);
});

const switchRoom = (room) => {
  if (room === currentRoom && !isDMMode) return;

  isDMMode = false;
  currentDMUser = null;

  socket.emit('chat:leave', currentRoom);
  socket.emit('chat:join', room);

  currentRoom = room;
  msgList.innerHTML = '';
  
  if (currentRoomTitle) {
    currentRoomTitle.textContent = `#${room}`;
  }

  document.querySelectorAll('#room-list li').forEach((li) => {
    li.classList.toggle('active', li.getAttribute('data-room') === room);
  });
  
  document.querySelectorAll('#users-list li').forEach((li) => {
    li.classList.remove('active');
  });
  
  loadRoomHistory(room);
};

createRoomBtn.addEventListener('click', () => {
  const room = newRoomInput.value.trim().toLowerCase();
  if (!room) return;

  const exists = [...roomList.children].some(
    (li) => li.getAttribute('data-room') === room
  );
  if (exists) {
    alert('Room already exists');
    return;
  }

  const li = document.createElement('li');
  li.setAttribute('data-room', room);
  li.textContent = room;
  roomList.appendChild(li);

  newRoomInput.value = '';
  switchRoom(room);
});

function startDM(user) {
  const currentUserId = getUserId();
  if (user.id === currentUserId) {
    alert("You can't message yourself!");
    return;
  }

  isDMMode = true;
  currentDMUser = user;
  
  socket.emit('chat:leave', currentRoom);
  
  const dmRoomId = [currentUserId, user.id].sort().join('-dm-');
  socket.emit('dm:start', { recipientId: user.id });
  socket.emit('chat:join', dmRoomId);
  
  if (currentRoomTitle) {
    currentRoomTitle.textContent = `💬 ${user.name}`;
  }
  
  msgList.innerHTML = '';
  
  document.querySelectorAll('#room-list li').forEach((li) => {
    li.classList.remove('active');
  });
  
  document.querySelectorAll('#users-list li').forEach((li) => {
    li.classList.toggle('active', li.getAttribute('data-user-id') === user.id);
  });
  
  loadDMHistory(user.id);
}

function loadRoomHistory(room) {
  if (messageHistory.has(room)) {
    displayHistory(messageHistory.get(room));
    return;
  }
  
  showLoadingIndicator();
  socket.emit('history:room', { room, limit: 50 });
}

function loadDMHistory(recipientId) {
  const dmRoomId = [getUserId(), recipientId].sort().join('-dm-');
  
  if (messageHistory.has(dmRoomId)) {
    displayHistory(messageHistory.get(dmRoomId));
    return;
  }
  
  showLoadingIndicator();
  socket.emit('history:dm', { recipientId, limit: 50 });
}

function displayHistory(messages) {
  hideLoadingIndicator();
  
  if (!messages || messages.length === 0) {
    showEmptyState();
    return;
  }
  
  msgList.innerHTML = '';
  messages.forEach(msg => displayMessage(msg, false));
}

function updateOnlineUsers(users) {
  if (!usersList) return;
  
  const currentUserId = getUserId();
  usersList.innerHTML = '';
  
  users.forEach(user => {
    if (user.id === currentUserId) return;
    
    const li = document.createElement('li');
    li.setAttribute('data-user-id', user.id);
    li.innerHTML = `
      <span class="user-status"></span>
      <span class="user-name">${escapeHtml(user.name)}</span>
    `;
    li.addEventListener('click', () => startDM(user));
    
    if (isDMMode && currentDMUser && currentDMUser.id === user.id) {
      li.classList.add('active');
    }
    
    usersList.appendChild(li);
  });
}

function displayMessage(data, animate = true) {
  const li = document.createElement('li');
  const time = new Date(data.ts).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  let messageContent = '';
  
  if (data.text) {
    messageContent += `<span class="message-content">${escapeHtml(data.text)}</span>`;
  }
  
  if (data.hasAttachment && data.attachment) {
    messageContent += renderAttachment(data.attachment);
  }
  
  li.innerHTML = `
    <span class="sender">${escapeHtml(data.sender)}:</span>
    ${messageContent}
    <span class="message-time">${time}</span>
  `;
  
  if (!animate) {
    li.style.animation = 'none';
  }
  
  msgList.appendChild(li);
  msgList.scrollTop = msgList.scrollHeight;
}

function renderAttachment(attachment) {
  const { category, url, originalName, mimetype } = attachment;
  const fileUrl = url.startsWith('http') ? url : `${apiHost}${url}`;
  
  if (category === 'images') {
    return `
      <div class="message-attachment">
        <a href="${fileUrl}" target="_blank" class="attachment-link">
          <img src="${fileUrl}" alt="${escapeHtml(originalName)}" class="attachment-image" />
        </a>
      </div>
    `;
  }
  
  if (category === 'videos') {
    return `
      <div class="message-attachment">
        <video controls class="attachment-video">
          <source src="${fileUrl}" type="${mimetype}">
        </video>
      </div>
    `;
  }
  
  if (category === 'audio') {
    return `
      <div class="message-attachment">
        <audio controls class="attachment-audio">
          <source src="${fileUrl}" type="${mimetype}">
        </audio>
      </div>
    `;
  }
  
  return `
    <div class="message-attachment">
      <a href="${fileUrl}" target="_blank" class="attachment-file">
        <span class="file-icon">${getFileIcon(mimetype)}</span>
        <span class="file-name">${escapeHtml(originalName)}</span>
      </a>
    </div>
  `;
}

function showLoadingIndicator() {
  msgList.innerHTML = '<div class="loading-indicator">Loading chat history...</div>';
}

function hideLoadingIndicator() {
  const indicator = msgList.querySelector('.loading-indicator');
  if (indicator) indicator.remove();
}

function showEmptyState() {
  msgList.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">💬</div>
      <div class="empty-state-text">No messages yet. Start the conversation!</div>
    </div>
  `;
}

function showMessage(text, type = 'info') {
  const div = document.createElement('div');
  div.className = `system-message ${type}`;
  div.textContent = text;
  msgList.appendChild(div);
  msgList.scrollTop = msgList.scrollHeight;
  
  setTimeout(() => div.remove(), 3000);
}

function showTypingIndicator(userName) {
  let indicator = document.getElementById('typing-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'typing-indicator';
    msgList.appendChild(indicator);
  }
  indicator.textContent = `${escapeHtml(userName)} is typing...`;
  msgList.scrollTop = msgList.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function showNotification(message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Chat App', { body: message });
  }
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

function getUserId() {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch (e) {
    console.error('Error parsing token:', e);
    return null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});