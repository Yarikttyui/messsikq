import state from './state.js';
class SocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }
  connect(token) {
    if (this.socket) {
      this.disconnect();
    }
    this.socket = io({
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,        // Быстрее переподключение
      reconnectionDelayMax: 2000,    // Максимум 2 секунды
      reconnectionAttempts: 10,      // Больше попыток
      timeout: 5000,                 // Таймаут соединения
      transports: ['websocket', 'polling'], // WebSocket приоритет
      upgrade: true,                 // Автоупгрейд до WebSocket
      rememberUpgrade: true          // Запомнить успешный апгрейд
    });
    this.setupListeners();
  }
  setupListeners() {
    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      state.emit('socket:connected');
    });
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connected = false;
      state.emit('socket:disconnected', reason);
    });
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        state.emit('socket:failed', error);
      }
    });
    this.socket.on('message:created', (message) => {
      console.log('New message:', message);
      state.addMessage(message.conversationId, message);
      const conversation = state.getConversation(message.conversationId);
      if (conversation) {
        state.setConversation({
          ...conversation,
          last_message: message.content,
          last_message_time: message.createdAt
        });
      }
    });
    this.socket.on('message:updated', (message) => {
      console.log('Message updated:', message);
      state.updateMessage(message.conversationId, message.id, message);
    });
    this.socket.on('message:deleted', (data) => {
      console.log('Message deleted:', data);
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        state.deleteMessage(conversationId, data.messageId);
      }
    });
    this.socket.on('message:reactions', (data) => {
      console.log('Message reactions updated:', data);
      import('./features/conversations/message-reactions.js').then(module => {
        module.updateReactionsUI(data.messageId, data.reactions);
      });
    });
    this.socket.on('typing:start', (data) => {
      const typingUsers = state.getTypingUsers(data.conversation_id);
      typingUsers.push(data.user_id);
      state.setTypingUsers(data.conversation_id, typingUsers);
    });
    this.socket.on('typing:stop', (data) => {
      const typingUsers = state.getTypingUsers(data.conversation_id).filter(
        id => id !== data.user_id
      );
      state.setTypingUsers(data.conversation_id, typingUsers);
    });
    this.socket.on('presence:update', (data) => {
      console.log('Presence update:', data);
      const onlineUsers = new Set(state.state.onlineUsers);
      if (data.status === 'online') {
        onlineUsers.add(data.user_id);
      } else {
        onlineUsers.delete(data.user_id);
      }
      state.setOnlineUsers(Array.from(onlineUsers));
    });
    this.socket.on('conversation:created', (data) => {
      console.log('Conversation created:', data);
      if (data.conversation) {
        state.addConversation(data.conversation);
        state.setCurrentConversation(data.conversation.id);
      }
    });
    this.socket.on('conversation:updated', (data) => {
      console.log('Conversation updated:', data);
      state.setConversation(data.conversation);
    });
    this.socket.on('conversation:deleted', (data) => {
      console.log('Conversation deleted:', data);
      state.deleteConversation(data.conversation_id);
    });
    this.socket.on('conversation:member_added', (data) => {
      console.log('Member added:', data);
      const members = state.getMembers(data.conversation_id);
      members.push(data.member);
      state.setMembers(data.conversation_id, members);
      state.emit('member:joined', {
        conversationId: data.conversation_id,
        userId: data.user_id,
        username: data.username
      });
    });
    this.socket.on('conversation:member_removed', (data) => {
      console.log('Member removed:', data);
      const members = state.getMembers(data.conversation_id).filter(
        m => m.user_id !== data.user_id
      );
      state.setMembers(data.conversation_id, members);
    });
    this.socket.on('conversation:read', (data) => {
      console.log('Conversation read:', data);
      state.setUnreadCount(data.conversation_id, 0);
    });
    this.socket.on('call:offer', async (data) => {
      console.log('Incoming call offer:', data);
      const { showIncomingCall } = await import('./calls.js');
      showIncomingCall(data);
    });
    this.socket.on('call:answer', async (data) => {
      console.log('Call answer received:', data);
    });
    this.socket.on('call:ice-candidate', async (data) => {
      console.log('ICE candidate received:', data);
    });
    this.socket.on('call:reject', async (data) => {
      console.log('Call rejected:', data);
      const { updateCallUI, hideCallModal } = await import('./calls.js');
      updateCallUI({ status: 'rejected', error: 'Звонок отклонён' });
      setTimeout(hideCallModal, 2000);
    });
    this.socket.on('call:end', async (data) => {
      console.log('Call ended:', data);
    });
  }
  startTyping(conversationId) {
    if (this.connected) {
      this.socket.emit('typing:start', { conversation_id: conversationId });
    }
  }
  stopTyping(conversationId) {
    if (this.connected) {
      this.socket.emit('typing:stop', { conversation_id: conversationId });
    }
  }
  markAsRead(conversationId) {
    if (this.connected) {
      this.socket.emit('conversation:read', { conversation_id: conversationId });
    }
  }
  updatePresence(status) {
    if (this.connected) {
      this.socket.emit('presence:update', { status });
    }
  }
  joinConversation(conversationId) {
    if (this.connected) {
      this.socket.emit('conversation:join', { conversation_id: conversationId });
    }
  }
  leaveConversation(conversationId) {
    if (this.connected) {
      this.socket.emit('conversation:leave', { conversation_id: conversationId });
    }
  }
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
  isConnected() {
    return this.connected;
  }
}
export default new SocketManager();
