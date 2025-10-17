class StateManager {
  constructor() {
    this.state = {
      user: null,
      currentConversationId: null,
      conversations: new Map(),
      messages: new Map(),
      members: new Map(),
      unreadCounts: new Map(),
      typingUsers: new Map(),
      onlineUsers: new Set(),
      filters: {
        inbox: 'all',
        search: ''
      },
      currentCall: null 
    };
    this.listeners = new Map(); 
  }
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event).delete(callback);
    };
  }
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }
  setUser(user) {
    this.state.user = user;
    this.emit('user:updated', user);
  }
  getUser() {
    return this.state.user;
  }
  getCurrentUser() {
    return this.state.user;
  }
  setCurrentUser(user) {
    this.setUser(user);
  }
  setCurrentConversation(conversationId) {
    this.state.currentConversationId = conversationId;
    this.emit('conversation:changed', conversationId);
  }
  getCurrentConversationId() {
    return this.state.currentConversationId;
  }
  setConversation(conversation) {
    this.state.conversations.set(conversation.id, conversation);
    this.emit('conversations:updated', this.getConversations());
  }
  addConversation(conversation) {
    this.setConversation(conversation);
  }
  setConversations(conversations) {
    const conversationsArray = Array.isArray(conversations) 
      ? conversations 
      : conversations.conversations || [];
    if (conversationsArray.length === 0) {
      console.warn('[StateManager] setConversations: Empty array, skipping clear');
      return;
    }
    this.state.conversations.clear();
    conversationsArray.forEach(conv => {
      this.state.conversations.set(conv.id, conv);
    });
    this.emit('conversations:updated', this.getConversations());
  }
  getConversations() {
    return Array.from(this.state.conversations.values());
  }
  getConversation(id) {
    return this.state.conversations.get(id);
  }
  deleteConversation(id) {
    this.state.conversations.delete(id);
    this.state.messages.delete(id);
    this.state.members.delete(id);
    this.emit('conversations:updated', this.getConversations());
  }
  setMessages(conversationId, messages) {
    this.state.messages.set(conversationId, messages);
    this.emit('messages:updated', { conversationId, messages });
  }
  addMessage(conversationId, message) {
    if (!this.state.messages.has(conversationId)) {
      this.state.messages.set(conversationId, []);
    }
    this.state.messages.get(conversationId).push(message);
    this.emit('message:added', { conversationId, message });
  }
  updateMessage(conversationId, messageId, updates) {
    const messages = this.state.messages.get(conversationId);
    if (messages) {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates };
        this.emit('message:updated', { conversationId, messageId, updates });
      }
    }
  }
  deleteMessage(conversationId, messageId) {
    const messages = this.state.messages.get(conversationId);
    if (messages) {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        messages.splice(index, 1);
        this.emit('message:deleted', { conversationId, messageId });
      }
    }
  }
  getMessages(conversationId) {
    return this.state.messages.get(conversationId) || [];
  }
  setMembers(conversationId, members) {
    this.state.members.set(conversationId, members);
    this.emit('members:updated', { conversationId, members });
  }
  getMembers(conversationId) {
    return this.state.members.get(conversationId) || [];
  }
  setUnreadCount(conversationId, count) {
    this.state.unreadCounts.set(conversationId, count);
    this.emit('unread:updated', { conversationId, count });
  }
  getUnreadCount(conversationId) {
    return this.state.unreadCounts.get(conversationId) || 0;
  }
  getTotalUnreadCount() {
    return Array.from(this.state.unreadCounts.values()).reduce((sum, count) => sum + count, 0);
  }
  setTypingUsers(conversationId, userIds) {
    this.state.typingUsers.set(conversationId, new Set(userIds));
    this.emit('typing:updated', { conversationId, userIds });
  }
  getTypingUsers(conversationId) {
    return Array.from(this.state.typingUsers.get(conversationId) || []);
  }
  setOnlineUsers(userIds) {
    this.state.onlineUsers = new Set(userIds);
    this.emit('presence:updated', userIds);
  }
  isUserOnline(userId) {
    return this.state.onlineUsers.has(userId);
  }
  setInboxFilter(filter) {
    this.state.filters.inbox = filter;
    this.emit('filter:changed', filter);
  }
  getInboxFilter() {
    return this.state.filters.inbox;
  }
  setSearchQuery(query) {
    this.state.filters.search = query;
    this.emit('search:changed', query);
  }
  getSearchQuery() {
    return this.state.filters.search;
  }
  setCurrentCall(call) {
    this.state.currentCall = call;
    this.emit('call:changed', call);
  }
  getCurrentCall() {
    return this.state.currentCall;
  }
  clear() {
    this.state.user = null;
    this.state.currentConversationId = null;
    this.state.conversations.clear();
    this.state.messages.clear();
    this.state.members.clear();
    this.state.unreadCounts.clear();
    this.state.typingUsers.clear();
    this.state.onlineUsers.clear();
    this.state.currentCall = null;
    this.emit('state:cleared');
  }
}
export default new StateManager();
