import state from '../../state.js';
let currentReplyTo = null;
export function setReplyTo(message) {
  if (!message || !message.id) {
    console.error('[MessageReplies] Invalid message:', message);
    return;
  }
  currentReplyTo = {
    id: message.id,
    content: message.content || '',
    userName: message.user?.displayName || message.user?.username || 'Пользователь',
    userId: message.user?.id || message.userId
  };
  showReplyPreview(currentReplyTo);
  console.log('[MessageReplies] ✅ Set reply to message:', currentReplyTo.id, 'User:', currentReplyTo.userName);
}
export function getReplyTo() {
  console.log('[MessageReplies] 📤 Getting reply:', currentReplyTo);
  return currentReplyTo;
}
export function clearReplyTo() {
  console.log('[MessageReplies] 🗑️ Clearing reply:', currentReplyTo?.id);
  currentReplyTo = null;
  hideReplyPreview();
}
function showReplyPreview(replyData) {
  let preview = document.querySelector('.reply-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'reply-preview';
    const messageInput = document.querySelector('.message-input-container');
    if (messageInput) {
      messageInput.insertBefore(preview, messageInput.firstChild);
    }
  }
  const displayContent = replyData.content || 'Вложение';
  const truncated = displayContent.length > 100 ? displayContent.substring(0, 100) + '...' : displayContent;
  preview.innerHTML = `
    <div class="reply-preview__content">
      <div class="reply-preview__header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 17l-5-5 5-5M20 17l-5-5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="reply-preview__label">Ответ для ${escapeHtml(replyData.userName)}</span>
      </div>
      <div class="reply-preview__text">${escapeHtml(truncated)}</div>
    </div>
    <button class="reply-preview__close" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;
  requestAnimationFrame(() => {
    preview.classList.add('visible');
  });
  const closeBtn = preview.querySelector('.reply-preview__close');
  if (closeBtn) {
    closeBtn.onclick = clearReplyTo;
  }
}
function hideReplyPreview() {
  const preview = document.querySelector('.reply-preview');
  if (preview) {
    preview.classList.remove('visible');
    setTimeout(() => preview.remove(), 200);
  }
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
export function renderReplyReference(replyToMessage) {
  if (!replyToMessage) return '';
  return `
    <div class="message-reply-reference" data-reply-to="${replyToMessage.id}">
      <div class="message-reply-reference__line"></div>
      <div class="message-reply-reference__content">
        <div class="message-reply-reference__author">${escapeHtml(replyToMessage.sender_name || 'Пользователь')}</div>
        <div class="message-reply-reference__text">${escapeHtml(replyToMessage.content || '').substring(0, 100)}${replyToMessage.content && replyToMessage.content.length > 100 ? '...' : ''}</div>
      </div>
    </div>
  `;
}
export async function sendReply(conversationId, content, replyToId) {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({
        content,
        reply_to_id: replyToId
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    clearReplyTo();
    return data.message;
  } catch (error) {
    console.error('[MessageReplies] Failed to send reply:', error);
    throw error;
  }
}
export async function loadReplyMessage(messageId) {
  try {
    const response = await fetch(`/api/messages/${messageId}`, {
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.message;
  } catch (error) {
    console.error('[MessageReplies] Failed to load reply message:', error);
    return null;
  }
}
export function scrollToReplyMessage(messageId) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    messageEl.classList.add('highlight');
    setTimeout(() => {
      messageEl.classList.remove('highlight');
    }, 2000);
  } else {
    console.warn('[MessageReplies] Message not found in DOM:', messageId);
  }
}
window.scrollToReplyMessage = scrollToReplyMessage;
