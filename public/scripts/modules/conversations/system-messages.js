import state from '../state.js';
import { getUserColor, getUserInitials } from '../utils.js';
export const SystemEventType = {
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  MEMBER_REMOVED: 'member_removed',
  MEMBER_PROMOTED: 'member_promoted',
  MEMBER_DEMOTED: 'member_demoted',
  CONVERSATION_CREATED: 'conversation_created',
  NAME_CHANGED: 'name_changed',
  AVATAR_CHANGED: 'avatar_changed'
};
export function addSystemMessage(eventType, data, conversationId) {
  const messagesContainer = document.querySelector('.messages-container');
  if (!messagesContainer) return;
  const systemMsg = createSystemMessage(eventType, data);
  if (!systemMsg) return;
  messagesContainer.appendChild(systemMsg);
  requestAnimationFrame(() => {
    systemMsg.classList.add('visible');
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  const message = {
    id: Date.now(),
    conversationId,
    type: 'system',
    eventType,
    data,
    createdAt: new Date().toISOString()
  };
  state.addMessage(message);
}
function createSystemMessage(eventType, data) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.dataset.eventType = eventType;
  let content = '';
  let icon = '';
  switch (eventType) {
    case SystemEventType.MEMBER_JOINED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> присоединился к беседе`;
      break;
    case SystemEventType.MEMBER_LEFT:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="18" y1="8" x2="23" y2="13"/>
          <line x1="23" y1="8" x2="18" y2="13"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> покинул беседу`;
      break;
    case SystemEventType.MEMBER_REMOVED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> был удален из беседы`;
      if (data.removedBy) {
        content += ` пользователем <strong>${data.removedBy}</strong>`;
      }
      break;
    case SystemEventType.MEMBER_PROMOTED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m18 16 4-4-4-4"/>
          <path d="m6 8-4 4 4 4"/>
          <path d="m14.5 4-5 16"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> теперь администратор`;
      break;
    case SystemEventType.MEMBER_DEMOTED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m18 16 4-4-4-4"/>
          <path d="m6 8-4 4 4 4"/>
          <path d="m14.5 4-5 16"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> больше не администратор`;
      break;
    case SystemEventType.CONVERSATION_CREATED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> создал беседу`;
      if (data.conversationName) {
        content += ` "${data.conversationName}"`;
      }
      break;
    case SystemEventType.NAME_CHANGED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> изменил название на "${data.newName}"`;
      break;
    case SystemEventType.AVATAR_CHANGED:
      icon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      `;
      content = `<strong>${data.username}</strong> обновил фото беседы`;
      break;
    default:
      return null;
  }
  div.innerHTML = `
    <div class="system-message-content">
      <span class="system-message-icon">${icon}</span>
      <span class="system-message-text">${content}</span>
    </div>
    <div class="system-message-time">${formatTime(new Date())}</div>
  `;
  return div;
}
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
export function handleMemberJoined(data) {
  const { conversationId, userId, username } = data;
  addSystemMessage(SystemEventType.MEMBER_JOINED, { username }, conversationId);
  updateMemberCount(conversationId, 1);
  showNotification(`${username} присоединился к беседе`, 'info');
}
export function handleMemberLeft(data) {
  const { conversationId, userId, username } = data;
  addSystemMessage(SystemEventType.MEMBER_LEFT, { username }, conversationId);
  updateMemberCount(conversationId, -1);
  showNotification(`${username} покинул беседу`, 'info');
}
export function handleMemberRemoved(data) {
  const { conversationId, userId, username, removedBy } = data;
  addSystemMessage(SystemEventType.MEMBER_REMOVED, { username, removedBy }, conversationId);
  updateMemberCount(conversationId, -1);
}
function updateMemberCount(conversationId, delta) {
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (!conversation) return;
  conversation.memberCount = (conversation.memberCount || 0) + delta;
  const counterElement = document.querySelector(`[data-conversation-id="${conversationId}"] .member-count`);
  if (counterElement) {
    counterElement.textContent = conversation.memberCount;
  }
  if (state.currentConversation?.id === conversationId) {
    const headerCount = document.querySelector('.conversation-header .member-count');
    if (headerCount) {
      headerCount.textContent = `${conversation.memberCount} участников`;
    }
  }
}
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `system-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
export async function loadSystemEvents(conversationId) {
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/conversations/${conversationId}/events`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return;
    const events = await response.json();
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;
    events.forEach(event => {
      const systemMsg = createSystemMessage(event.eventType, event.data);
      if (systemMsg) {
        messagesContainer.appendChild(systemMsg);
      }
    });
  } catch (error) {
    console.error('[SystemMessages] Load events error:', error);
  }
}
export async function saveSystemEvent(conversationId, eventType, data) {
  try {
    const token = sessionStorage.getItem('token');
    await fetch(`/api/conversations/${conversationId}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType,
        data,
        timestamp: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error('[SystemMessages] Save event error:', error);
  }
}
