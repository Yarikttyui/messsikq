import state from './state.js';
import socket from './socket.js';
import * as api from './api.js';
const QUICK_REACTIONS = ['❤️', '👍', '🔥', '😂', '😮', '😢', '🎉', '👏'];
let activeContextMenu = null;
let activeReactionPicker = null;
export function showMessageContextMenu(messageElement, messageData, event) {
  event.preventDefault();
  event.stopPropagation();
  hideContextMenu();
  const currentUser = state.getUser();
  const isOwnMessage = messageData.user?.id === currentUser.id;
  const menu = document.createElement('div');
  menu.className = 'message-context-menu';
  menu.innerHTML = `
    <div class="context-menu-reactions">
      ${QUICK_REACTIONS.map(emoji => `
        <button class="reaction-btn" data-emoji="${emoji}" title="Реакция ${emoji}">
          ${emoji}
        </button>
      `).join('')}
      <button class="reaction-more-btn" title="Больше реакций">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </button>
    </div>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item" data-action="reply">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
      </svg>
      <span>Ответить</span>
    </button>
    ${!messageData.content || messageData.content.trim() ? `
      <button class="context-menu-item" data-action="copy">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>Копировать текст</span>
      </button>
    ` : ''}
    <button class="context-menu-item" data-action="forward">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 10l5-5-5-5M4 19h11a5 5 0 0 0 5-5v-5"/>
      </svg>
      <span>Переслать</span>
    </button>
    <button class="context-menu-item" data-action="pin">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0-5-3-7-9-7s-9 2-9 7c0 5 3 7 9 7 1 0 2 0 3-1l3 3v-6h0c3-1 3-2 3-3z"/>
      </svg>
      <span>Закрепить</span>
    </button>
    <button class="context-menu-item" data-action="select">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      <span>Выбрать</span>
    </button>
    ${isOwnMessage ? `
      <div class="context-menu-divider"></div>
      <button class="context-menu-item" data-action="edit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span>Редактировать</span>
      </button>
      <button class="context-menu-item danger" data-action="delete">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span>Удалить</span>
      </button>
    ` : ''}
    <div class="context-menu-divider"></div>
    <button class="context-menu-item" data-action="info">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <span>Информация</span>
    </button>
  `;
  document.body.appendChild(menu);
  activeContextMenu = menu;
  positionContextMenu(menu, event.clientX, event.clientY);
  setupContextMenuHandlers(menu, messageData, messageElement);
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', hideContextMenu);
  }, 0);
}
function positionContextMenu(menu, x, y) {
  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = x;
  let top = y;
  if (left + menuRect.width > viewportWidth) {
    left = viewportWidth - menuRect.width - 16;
  }
  if (top + menuRect.height > viewportHeight) {
    top = viewportHeight - menuRect.height - 16;
  }
  if (left < 16) {
    left = 16;
  }
  if (top < 16) {
    top = 16;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  requestAnimationFrame(() => {
    menu.classList.add('active');
  });
}
function setupContextMenuHandlers(menu, messageData, messageElement) {
  menu.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = btn.dataset.emoji;
      addReaction(messageData.id, emoji);
      hideContextMenu();
    });
  });
  const moreBtn = menu.querySelector('.reaction-more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFullReactionPicker(messageData.id, moreBtn);
    });
  }
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      hideContextMenu();
      switch (action) {
        case 'reply':
          handleReply(messageData);
          break;
        case 'copy':
          handleCopy(messageData);
          break;
        case 'forward':
          handleForward(messageData);
          break;
        case 'pin':
          handlePin(messageData);
          break;
        case 'select':
          handleSelect(messageData, messageElement);
          break;
        case 'edit':
          handleEdit(messageData, messageElement);
          break;
        case 'delete':
          handleDelete(messageData);
          break;
        case 'info':
          handleInfo(messageData);
          break;
      }
    });
  });
}
function showFullReactionPicker(messageId, anchorElement) {
  const picker = document.createElement('div');
  picker.className = 'reaction-picker-full';
  const emojiCategories = {
    '😀 Смайлы': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲'],
    '❤️ Сердечки': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    '👍 Жесты': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✍️', '🙏', '🦶', '🦵'],
    '🎉 Праздники': ['🎉', '🎊', '🎈', '🎁', '🎀', '🎂', '🍰', '🧁', '🥳', '🎆', '🎇', '✨', '🎃', '🎄', '🎋', '🎍'],
    '🔥 Другое': ['🔥', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤']
  };
  picker.innerHTML = `
    <div class="reaction-picker-header">
      <h4>Выберите реакцию</h4>
      <button class="reaction-picker-close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="reaction-picker-content">
      ${Object.entries(emojiCategories).map(([category, emojis]) => `
        <div class="reaction-category">
          <div class="reaction-category-title">${category}</div>
          <div class="reaction-grid">
            ${emojis.map(emoji => `
              <button class="reaction-grid-item" data-emoji="${emoji}">${emoji}</button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.body.appendChild(picker);
  activeReactionPicker = picker;
  const rect = anchorElement.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 8}px`;
  const pickerRect = picker.getBoundingClientRect();
  if (pickerRect.right > window.innerWidth) {
    picker.style.left = `${window.innerWidth - pickerRect.width - 16}px`;
  }
  if (pickerRect.bottom > window.innerHeight) {
    picker.style.top = `${rect.top - pickerRect.height - 8}px`;
  }
  requestAnimationFrame(() => {
    picker.classList.add('active');
  });
  picker.querySelector('.reaction-picker-close').addEventListener('click', hideReactionPicker);
  picker.querySelectorAll('.reaction-grid-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      addReaction(messageId, emoji);
      hideReactionPicker();
    });
  });
  setTimeout(() => {
    document.addEventListener('click', hideReactionPicker);
  }, 0);
}
async function addReaction(messageId, emoji) {
  console.log('[ContextMenu] Adding reaction:', messageId, emoji);
  try {
    const response = await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({ emoji })
    });
    if (!response.ok) {
      throw new Error('Failed to add reaction');
    }
    const data = await response.json();
    const { updateReactionsUI } = await import('./features/conversations/message-reactions.js');
    updateReactionsUI(messageId, data.reactions);
  } catch (error) {
    console.error('[ContextMenu] Failed to add reaction:', error);
    showToast('Не удалось добавить реакцию', 'error');
  }
}
function handleReply(messageData) {
  state.emit('message:reply', messageData);
}
function handleCopy(messageData) {
  if (messageData.content) {
    navigator.clipboard.writeText(messageData.content).then(() => {
      showToast('Текст скопирован', 'success');
    }).catch(() => {
      showToast('Не удалось скопировать', 'error');
    });
  }
}
async function handleForward(messageData) {
  showToast('Функция пересылки временно недоступна', 'info');
  console.log('[MessageContextMenu] Forward message:', messageData);
}
async function handlePin(messageData) {
  const conversationId = state.getCurrentConversationId();
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/conversations/${conversationId}/pinned`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ messageId: messageData.id })
    });
    if (response.ok) {
      showToast('Сообщение закреплено', 'success');
      state.emit('message:pinned', { messageId: messageData.id, conversationId });
    } else {
      const error = await response.json();
      showToast(error.message || 'Не удалось закрепить', 'error');
    }
  } catch (error) {
    console.error('[MessageContextMenu] Pin error:', error);
    showToast('Ошибка при закреплении', 'error');
  }
}
function handleSelect(messageData, messageElement) {
  messageElement.classList.toggle('selected');
  state.emit('message:selected', { messageId: messageData.id, selected: messageElement.classList.contains('selected') });
}
function handleEdit(messageData, messageElement) {
  state.emit('message:edit', { messageData, messageElement });
}
async function handleDelete(messageData) {
  if (!confirm('Удалить это сообщение?')) return;
  const conversationId = state.getCurrentConversationId();
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/messages/${messageData.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.ok) {
      showToast('Сообщение удалено', 'success');
      state.deleteMessage(conversationId, messageData.id);
    } else {
      const error = await response.json();
      showToast(error.message || 'Не удалось удалить', 'error');
    }
  } catch (error) {
    console.error('[MessageContextMenu] Delete error:', error);
    showToast('Ошибка при удалении', 'error');
  }
}
function handleInfo(messageData) {
  const date = new Date(messageData.createdAt);
  const edited = messageData.editedAt ? `\nРедактировано: ${new Date(messageData.editedAt).toLocaleString('ru-RU')}` : '';
  alert(`Информация о сообщении:\n\nОт: ${messageData.user?.displayName || messageData.user?.username}\nВремя: ${date.toLocaleString('ru-RU')}${edited}\nID: ${messageData.id}`);
}
function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.classList.remove('active');
    setTimeout(() => {
      if (activeContextMenu && activeContextMenu.parentNode) {
        activeContextMenu.remove();
      }
      activeContextMenu = null;
    }, 200);
    document.removeEventListener('click', hideContextMenu);
    document.removeEventListener('contextmenu', hideContextMenu);
  }
}
function hideReactionPicker() {
  if (activeReactionPicker) {
    activeReactionPicker.classList.remove('active');
    setTimeout(() => {
      if (activeReactionPicker && activeReactionPicker.parentNode) {
        activeReactionPicker.remove();
      }
      activeReactionPicker = null;
    }, 200);
    document.removeEventListener('click', hideReactionPicker);
  }
}
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `message-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
export {
  hideContextMenu,
  hideReactionPicker
};
