import state from './state.js';
import { formatTime, formatLastSeen, getUserColor, getUserInitials } from './utils.js';
import { showJoinConversationModal } from './conversations/join-conversation.js';
import { initShuffleText } from '../effects/shuffle-text.js';
let chatStackEl;
let tabButtons;
let composeBtn;
let joinByCodeBtn;
export function init() {
  chatStackEl = document.getElementById('chatStack');
  tabButtons = document.querySelectorAll('.tab-btn');
  composeBtn = document.getElementById('composeBtn');
  joinByCodeBtn = document.getElementById('joinByCodeBtn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      setActiveTab(btn);
      state.setInboxFilter(filter);
      renderConversations();
    });
  });
  if (composeBtn) {
    composeBtn.addEventListener('click', () => {
      state.emit('ui:compose');
    });
  }
  if (joinByCodeBtn) {
    joinByCodeBtn.addEventListener('click', () => {
      showJoinConversationModal();
    });
  }
  state.on('conversations:updated', renderConversations);
  state.on('conversation:changed', updateActiveCard);
  state.on('unread:updated', updateUnreadBadges);
  state.on('message:added', handleNewMessage);
  state.on('filter:changed', renderConversations);
  const shuffleText = initShuffleText({
    duration: 0.6,
    iterations: 10,
    fps: 20
  });
  setTimeout(() => {
    shuffleText.applyOnHover('.chat-card__name');
  }, 500);
}
function setActiveTab(activeBtn) {
  tabButtons.forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');
}
function renderConversations() {
  const conversations = state.getConversations();
  const filter = state.getInboxFilter() || 'all';
  let filtered = conversations;
  if (filter === 'all') {
    filtered = conversations;
  } else if (filter === 'direct') {
    filtered = conversations.filter(conv => {
      if (conv.type === 'direct') return true;
      if (conv.memberCount === 2) return true;
      return false;
    });
  } else if (filter === 'group') {
    filtered = conversations.filter(conv => {
      if (conv.type === 'group' && conv.memberCount > 2) return true;
      return false;
    });
  } else if (filter === 'unread') {
    filtered = conversations.filter(conv => state.getUnreadCount(conv.id) > 0);
  } else if (filter === 'mentions') {
    filtered = conversations.filter(conv => conv.has_mention);
  }
  filtered.sort((a, b) => {
    const timeA = new Date(a.last_message_time || 0);
    const timeB = new Date(b.last_message_time || 0);
    return timeB - timeA;
  });
  let emptyMessage = 'Нет бесед';
  if (filter === 'direct') {
    emptyMessage = 'Нет личных чатов';
  } else if (filter === 'group') {
    emptyMessage = 'Нет групповых бесед';
  } else if (filter === 'unread') {
    emptyMessage = 'Нет непрочитанных';
  } else if (filter === 'mentions') {
    emptyMessage = 'Нет упоминаний';
  }
  
  if (!chatStackEl) {
    console.warn('[Inbox] Chat stack element not found');
    return;
  }
  
  chatStackEl.innerHTML = filtered.length > 0
    ? filtered.map(conv => renderChatCard(conv)).join('')
    : `<div class="info-empty">${emptyMessage}</div>`;
  chatStackEl.querySelectorAll('.chat-card').forEach(card => {
    card.addEventListener('click', () => {
      const conversationId = parseInt(card.dataset.id);
      state.setCurrentConversation(conversationId);
    });
  });
  updateUnreadBadges();
}
function renderChatCard(conversation) {
  const unreadCount = state.getUnreadCount(conversation.id);
  const isActive = state.getCurrentConversationId() === conversation.id;
  const hasUnread = unreadCount > 0;
  let avatarContent = '';
  const userName = conversation.title || conversation.username || 'Unknown';
  if (conversation.avatar) {
    avatarContent = `<img src="/uploads/${conversation.avatar}" alt="${escapeHtml(userName)}" class="chat-avatar-img" />`;
  } else {
    const userId = conversation.other_user_id || conversation.id;
    const userColor = getUserColor(userId, userName);
    const initials = getUserInitials(userName);
    avatarContent = `
      <div class="chat-avatar-placeholder" style="background: ${userColor};">
        <span class="chat-avatar-initials">${initials}</span>
      </div>
    `;
  }
  return `
    <div class="chat-card ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
         data-id="${conversation.id}">
      <div class="chat-avatar">
        ${avatarContent}
      </div>
      <div class="chat-info">
        <div class="chat-header">
          <span class="chat-name">${escapeHtml(userName)}</span>
          <span class="chat-time">${formatTime(conversation.last_message_time)}</span>
        </div>
        <div class="chat-preview">
          <span class="chat-last-message">${escapeHtml(conversation.last_message || 'No messages yet')}</span>
          ${hasUnread ? `<span class="chat-unread-pill">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}
function updateActiveCard() {
  const currentId = state.getCurrentConversationId();
  chatStackEl.querySelectorAll('.chat-card').forEach(card => {
    if (parseInt(card.dataset.id) === currentId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}
function updateUnreadBadges() {
  const totalUnread = state.getTotalUnreadCount();
  tabButtons.forEach(btn => {
    const badge = btn.querySelector('.tab-badge');
    if (btn.dataset.filter === 'unread') {
      if (badge) {
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        badge.style.display = totalUnread > 0 ? 'flex' : 'none';
      }
    }
  });
  const railBadge = document.querySelector('.rail-button[data-view="messages"] .rail-badge');
  if (railBadge) {
    railBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    railBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
  }
}
function handleNewMessage({ conversationId, message }) {
  const conversation = state.getConversation(conversationId);
  if (conversation) {
    state.setConversation({
      ...conversation,
      last_message: message.content,
      last_message_time: message.created_at
    });
  }
  if (conversationId !== state.getCurrentConversationId()) {
    const currentUnread = state.getUnreadCount(conversationId);
    state.setUnreadCount(conversationId, currentUnread + 1);
  }
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
export async function loadConversations() {
  try {
    const { conversations } = await import('./api.js');
    const data = await conversations.getAll();
    data.conversations.forEach(conv => {
      state.setConversation(conv);
      state.setUnreadCount(conv.id, conv.unread_count || 0);
    });
    renderConversations();
  } catch (error) {
    console.error('Failed to load conversations:', error);
    state.emit('error', { message: 'Не удалось загрузить беседы' });
  }
}
