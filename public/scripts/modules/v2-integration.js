import { showProfileModal } from './features/profiles/profile-modal.js';
import { showProfileEditor } from './features/profiles/profile-editor.js';
import { showReactionPicker, handleReaction } from './features/conversations/message-reactions.js';
import { showPinnedMessages, pinMessage, unpinMessage } from './features/conversations/pinned-messages.js';
import { setReplyTo } from './features/conversations/message-replies.js';
import { startEditingMessage, deleteMessage, canEditMessage } from './features/conversations/message-editing.js';
import { showSearchBar } from './features/conversations/conversation-search.js';
import { showGalleryManager } from './features/media/gallery-manager.js';
import { initClickSpark } from '../effects/click-spark.js';
import { initShuffleText } from '../effects/shuffle-text.js';
import state from './state.js';
export function initV2Integration() {
  console.log('[V2 Integration] Initializing...');
  initEffects();
  attachProfileListeners();
  attachMessageListeners();
  attachConversationListeners();
  attachKeyboardShortcuts();
  console.log('[V2 Integration] Ready!');
}
function initEffects() {
  initClickSpark();
  initShuffleText();
  console.log('[V2 Integration] Effects initialized');
}
function attachProfileListeners() {
  document.addEventListener('click', (e) => {
    const inboxAvatar = e.target.closest('.inbox-item-avatar, .conversation-avatar');
    if (inboxAvatar) {
      const userId = parseInt(inboxAvatar.dataset.userId);
      if (userId && !isNaN(userId)) {
        e.preventDefault();
        e.stopPropagation();
        showProfileModal(userId);
        return;
      }
    }
    const messageAvatar = e.target.closest('.message-avatar');
    if (messageAvatar) {
      const messageEl = messageAvatar.closest('.message-item');
      if (messageEl) {
        const senderId = parseInt(messageEl.dataset.senderId);
        if (senderId && !isNaN(senderId)) {
          e.preventDefault();
          e.stopPropagation();
          showProfileModal(senderId);
          return;
        }
      }
    }
    const senderName = e.target.closest('.message-sender-name');
    if (senderName) {
      const messageEl = senderName.closest('.message-item');
      if (messageEl) {
        const senderId = parseInt(messageEl.dataset.senderId);
        if (senderId && !isNaN(senderId)) {
          e.preventDefault();
          e.stopPropagation();
          showProfileModal(senderId);
          return;
        }
      }
    }
  });
  const editProfileBtn = document.getElementById('editProfileBtn');
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      showProfileEditor();
    });
  }
  console.log('[V2 Integration] Profile listeners attached');
}
function attachMessageListeners() {
  document.addEventListener('contextmenu', (e) => {
    const messageItem = e.target.closest('.message-item');
    if (messageItem) {
      e.preventDefault();
      const messageId = parseInt(messageItem.dataset.messageId);
      const senderId = parseInt(messageItem.dataset.senderId);
      const content = messageItem.querySelector('.message-content')?.textContent || '';
      const createdAt = messageItem.dataset.createdAt;
      if (!messageId || isNaN(messageId)) return;
      const message = {
        id: messageId,
        sender_id: senderId,
        content: content,
        created_at: createdAt
      };
      showMessageContextMenu(message, e.clientX, e.clientY);
    }
  });
  console.log('[V2 Integration] Message listeners attached');
}
function showMessageContextMenu(message, x, y) {
  const currentUser = state.getUser();
  if (!currentUser) return;
  const isOwnMessage = message.sender_id === currentUser.id;
  const canEdit = isOwnMessage && canEditMessage(message);
  const oldMenu = document.querySelector('.message-context-menu');
  if (oldMenu) oldMenu.remove();
  const menu = document.createElement('div');
  menu.className = 'message-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const items = [
    {
      icon: '↩️',
      label: 'Ответить',
      action: () => {
        setReplyTo(message);
        menu.remove();
      }
    },
    {
      icon: '😊',
      label: 'Реакция',
      action: () => {
        showReactionPicker(message.id);
        menu.remove();
      }
    },
    {
      icon: '📌',
      label: 'Закрепить',
      action: async () => {
        const conversationId = state.getCurrentConversationId();
        if (conversationId) {
          await pinMessage(message.id, conversationId);
        }
        menu.remove();
      }
    }
  ];
  if (canEdit) {
    items.push({
      icon: '✏️',
      label: 'Редактировать',
      action: () => {
        startEditingMessage(message);
        menu.remove();
      }
    });
  }
  if (isOwnMessage) {
    items.push({
      icon: '🗑️',
      label: 'Удалить',
      action: () => {
        deleteMessage(message.id);
        menu.remove();
      },
      danger: true
    });
  }
  menu.innerHTML = items.map(item => `
    <button class="context-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.label}">
      <span class="context-menu-icon">${item.icon}</span>
      <span class="context-menu-label">${item.label}</span>
    </button>
  `).join('');
  document.body.appendChild(menu);
  requestAnimationFrame(() => {
    menu.classList.add('show');
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (item) {
      const label = item.dataset.action;
      const action = items.find(i => i.label === label)?.action;
      if (action) action();
    }
  });
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.classList.remove('show');
      setTimeout(() => menu.remove(), 200);
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}
function attachConversationListeners() {
  const pinnedBtn = document.getElementById('viewPinnedBtn');
  if (pinnedBtn) {
    pinnedBtn.addEventListener('click', () => {
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        showPinnedMessages(conversationId);
      }
    });
  }
  const searchBtn = document.getElementById('searchConversationBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        showSearchBar(conversationId);
      }
    });
  }
  console.log('[V2 Integration] Conversation listeners attached');
}
function attachKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') {
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        e.preventDefault();
        showSearchBar(conversationId);
      }
    }
    if (e.ctrlKey && e.key === 'p') {
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        e.preventDefault();
        showPinnedMessages(conversationId);
      }
    }
    if (e.ctrlKey && e.key === 'e') {
      const currentUser = state.getUser();
      if (currentUser) {
        e.preventDefault();
        showProfileEditor();
      }
    }
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal-overlay.show');
      if (modals.length > 0) {
        const topModal = modals[modals.length - 1];
        const closeBtn = topModal.querySelector('.modal-close');
        if (closeBtn) closeBtn.click();
      }
    }
  });
  console.log('[V2 Integration] Keyboard shortcuts attached');
}
export function addV2ButtonsToHeader() {
  const conversationHeader = document.querySelector('.conversation-header-actions');
  if (!conversationHeader) return;
  if (document.getElementById('searchConversationBtn')) return;
  const buttons = `
    <button class="btn-icon" id="searchConversationBtn" title="Поиск (Ctrl+F)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
    </button>
    <button class="btn-icon" id="viewPinnedBtn" title="Закреплённые (Ctrl+P)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 17v5"></path>
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
      </svg>
    </button>
  `;
  conversationHeader.insertAdjacentHTML('beforeend', buttons);
  attachConversationListeners();
}
export function attachSocketListeners(socket) {
  if (!socket) return;
  socket.on('message:edited', ({ messageId, content, editedAt }) => {
    console.log('[V2 Integration] Message edited:', messageId);
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    const contentEl = messageEl.querySelector('.message-content');
    if (contentEl) {
      contentEl.textContent = content;
    }
    const timestamp = messageEl.querySelector('.message-time');
    if (timestamp && !timestamp.querySelector('.message-edited-label')) {
      const editedLabel = document.createElement('span');
      editedLabel.className = 'message-edited-label';
      editedLabel.textContent = '(изменено)';
      timestamp.appendChild(editedLabel);
    }
  });
  socket.on('message:deleted', ({ messageId }) => {
    console.log('[V2 Integration] Message deleted:', messageId);
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0';
      messageEl.style.transform = 'translateX(-20px)';
      setTimeout(() => messageEl.remove(), 300);
    }
  });
  socket.on('message:pinned', ({ conversationId, messageId }) => {
    console.log('[V2 Integration] Message pinned:', messageId);
  });
  socket.on('message:unpinned', ({ conversationId, messageId }) => {
    console.log('[V2 Integration] Message unpinned:', messageId);
  });
  socket.on('reaction:added', ({ messageId, emoji, userId }) => {
    console.log('[V2 Integration] Reaction added:', emoji, 'to', messageId);
  });
  console.log('[V2 Integration] Socket listeners attached');
}
export default {
  initV2Integration,
  addV2ButtonsToHeader,
  attachSocketListeners
};
