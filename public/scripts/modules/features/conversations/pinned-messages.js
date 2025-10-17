import state from '../../state.js';
import { formatTime } from '../../utils.js';
export async function showPinnedMessages(conversationId) {
  console.log('[PinnedMessages] Loading pinned messages for:', conversationId);
  try {
    const response = await fetch(`/api/conversations/${conversationId}/pinned`, {
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.pinned.length === 0) {
      showToast('Нет закреплённых сообщений', 'info');
      return;
    }
    const modal = createPinnedModal(conversationId, data.pinned);
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  } catch (error) {
    console.error('[PinnedMessages] Failed to load pinned messages:', error);
    showToast('Ошибка при загрузке закреплённых сообщений', 'error');
  }
}
function createPinnedModal(conversationId, pinnedMessages) {
  const modal = document.createElement('div');
  modal.className = 'pinned-messages-modal';
  modal.id = 'pinnedMessagesModal';
  modal.innerHTML = `
    <div class="pinned-messages-modal__overlay"></div>
    <div class="pinned-messages-modal__content">
      <div class="pinned-messages-modal__header">
        <h2>Закреплённые сообщения</h2>
        <button class="pinned-messages-modal__close" id="closePinnedModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="pinned-messages-modal__body">
        ${pinnedMessages.map(msg => renderPinnedMessage(msg, conversationId)).join('')}
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector('#closePinnedModal');
  const overlay = modal.querySelector('.pinned-messages-modal__overlay');
  closeBtn.addEventListener('click', () => closePinnedModal(modal));
  overlay.addEventListener('click', () => closePinnedModal(modal));
  return modal;
}
function renderPinnedMessage(msg, conversationId) {
  return `
    <div class="pinned-message-item" data-message-id="${msg.id}">
      <div class="pinned-message-item__header">
        <span class="pinned-message-item__author">${escapeHtml(msg.sender_name)}</span>
        <span class="pinned-message-item__time">${formatTime(msg.created_at)}</span>
      </div>
      <div class="pinned-message-item__content">
        ${escapeHtml(msg.content || '')}
      </div>
      <div class="pinned-message-item__actions">
        <button class="btn-text" onclick="window.scrollToMessage('${msg.id}')">
          Перейти к сообщению
        </button>
        <button class="btn-text btn-danger" onclick="window.unpinMessage('${msg.id}', '${conversationId}')">
          Открепить
        </button>
      </div>
    </div>
  `;
}
export async function pinMessage(messageId, conversationId) {
  try {
    console.log('[PinnedMessages] Pinning message:', messageId);
    const response = await fetch(`/api/conversations/${conversationId}/pinned`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({ messageId })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    showToast('Сообщение закреплено', 'success');
    updatePinnedBanner(conversationId);
  } catch (error) {
    console.error('[PinnedMessages] Failed to pin message:', error);
    showToast(error.message || 'Ошибка при закреплении сообщения', 'error');
  }
}
export async function unpinMessage(messageId, conversationId) {
  try {
    console.log('[PinnedMessages] Unpinning message:', messageId);
    const response = await fetch(`/api/conversations/${conversationId}/pinned/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    showToast('Сообщение откреплено', 'success');
    updatePinnedBanner(conversationId);
    const modal = document.getElementById('pinnedMessagesModal');
    if (modal) {
      closePinnedModal(modal);
    }
  } catch (error) {
    console.error('[PinnedMessages] Failed to unpin message:', error);
    showToast('Ошибка при откреплении сообщения', 'error');
  }
}
async function updatePinnedBanner(conversationId) {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/pinned`, {
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) return;
    const data = await response.json();
    const existingBanner = document.querySelector('.pinned-banner');
    if (data.pinned.length > 0) {
      if (!existingBanner) {
        createPinnedBanner(conversationId, data.pinned);
      } else {
        updatePinnedBannerContent(existingBanner, data.pinned);
      }
    } else {
      if (existingBanner) {
        existingBanner.remove();
      }
    }
  } catch (error) {
    console.error('[PinnedMessages] Failed to update banner:', error);
  }
}
function createPinnedBanner(conversationId, pinnedMessages) {
  const banner = document.createElement('div');
  banner.className = 'pinned-banner';
  updatePinnedBannerContent(banner, pinnedMessages);
  banner.addEventListener('click', () => {
    showPinnedMessages(conversationId);
  });
  const chatWindow = document.querySelector('.chat-window');
  if (chatWindow) {
    chatWindow.insertBefore(banner, chatWindow.firstChild);
  }
}
function updatePinnedBannerContent(banner, pinnedMessages) {
  const latestPinned = pinnedMessages[0];
  banner.innerHTML = `
    <div class="pinned-banner__icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 10c0-1-1-2-2-3V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3c-1 1-2 2-2 3v3a1 1 0 0 0 1 1h5v8l3-3 3 3v-8h5a1 1 0 0 0 1-1z" 
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="pinned-banner__content">
      <div class="pinned-banner__text">${escapeHtml(latestPinned.content || '').substring(0, 50)}...</div>
      <div class="pinned-banner__count">${pinnedMessages.length} закреплено</div>
    </div>
  `;
}
function closePinnedModal(modal) {
  modal.classList.remove('visible');
  setTimeout(() => modal.remove(), 300);
}
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `message-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
window.unpinMessage = unpinMessage;
window.scrollToMessage = (messageId) => {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messageEl.classList.add('highlight');
    setTimeout(() => messageEl.classList.remove('highlight'), 2000);
  }
};
export { updatePinnedBanner };
