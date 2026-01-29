# Real-Time Chat Application (WebSocket Based)

## 📌 Project Overview
This project is a real-time chat application built using **WebSocket technology** to enable instant communication between users. The application allows users to create accounts, join public chat rooms, initiate private conversations, and exchange messages in real time with low latency.

The goal of this project is to demonstrate real-time bidirectional communication, user session handling, and scalable chat architecture.

---

## 🚀 Features

### Core Features
- User registration and login
- Real-time text messaging using WebSockets
- Public chat rooms
- Private one-to-one messaging
- Instant message delivery without page refresh

### Optional / Enhanced Features
- Chat history persistence
- User presence indicators (online / offline)
- Real-time notifications
- Multimedia file sharing (images, files)
- Typing indicators (optional)

---

## 🛠️ Technologies Used
- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js  
- **WebSocket:** Socket.IO / WebSocket API  
- **Database:** MongoDB / MySQL (for users & chat history)  
- **Authentication:** Session-based / JWT authentication  

*(Technologies may vary based on implementation)*

---

## 🧩 Application Workflow
1. User creates an account or logs in
2. User joins a chat room or selects a private chat
3. Messages are sent and received instantly via WebSockets
4. Chat history is stored and retrieved from the database
5. User presence and notifications update in real time

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js installed
- Database setup (MongoDB / MySQL)
- Basic knowledge of WebSockets

### Steps
```bash
# Clone the repository
git clone https://github.com/your-username/your-repo-name.git

# Navigate to project directory
cd your-repo-name

# Install dependencies
npm install

# Start the server
npm start
