import state from '../../state.js';
export function startEditingMessage(message) {
  console.log('[MessageEditing] Start editing:', message.id);
  const messageEl = document.querySelector(`[data-message-id="${message.id}"]`);
  if (!messageEl) {
    console.error('[MessageEditing] Message element not found');
    return;
  }
  const bubble = messageEl;
  const contentEl = bubble.querySelector('.message-content');
  if (!contentEl) {
    console.error('[MessageEditing] Content element not found');
    return;
  }
  const originalContent = message.content;
  const editForm = document.createElement('div');
  editForm.className = 'message-edit-form';
  editForm.innerHTML = `
    <textarea class="message-edit-input" id="editInput_${message.id}">${escapeHtml(originalContent)}</textarea>
    <div class="message-edit-actions">
      <button class="btn-text" id="cancelEditBtn_${message.id}">Отмена</button>
      <button class="btn-primary btn-sm" id="saveEditBtn_${message.id}">Сохранить</button>
    </div>
  `;
  contentEl.style.display = 'none';
  bubble.insertBefore(editForm, contentEl.nextSibling);
  const textarea = editForm.querySelector('.message-edit-input');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.dispatchEvent(new Event('input'));
  const cancelBtn = editForm.querySelector(`#cancelEditBtn_${message.id}`);
  const saveBtn = editForm.querySelector(`#saveEditBtn_${message.id}`);
  cancelBtn.addEventListener('click', () => {
    cancelEditing(message.id);
  });
  saveBtn.addEventListener('click', () => {
    const newContent = textarea.value.trim();
    if (newContent && newContent !== originalContent) {
      saveEdit(message.id, newContent);
    } else {
      cancelEditing(message.id);
    }
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelBtn.click();
    }
  });
}
function cancelEditing(messageId) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) return;
  const editForm = messageEl.querySelector('.message-edit-form');
  const contentEl = messageEl.querySelector('.message-content');
  if (editForm) {
    editForm.remove();
  }
  if (contentEl) {
    contentEl.style.display = '';
  }
  console.log('[MessageEditing] Cancelled editing:', messageId);
}
async function saveEdit(messageId, newContent) {
  try {
    console.log('[MessageEditing] Saving edit:', messageId);
    const response = await fetch(`/api/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({ content: newContent })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    updateMessageContent(messageId, newContent, true);
    const conversationId = state.getCurrentConversationId();
    const messages = state.getMessages(conversationId);
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex !== -1) {
      messages[msgIndex] = {
        ...messages[msgIndex],
        content: newContent,
        editedAt: new Date().toISOString()
      };
      state.setMessages(conversationId, messages);
    }
    showToast('Сообщение отредактировано', 'success');
    console.log('[MessageEditing] Message updated successfully');
  } catch (error) {
    console.error('[MessageEditing] Failed to save edit:', error);
    showToast('Ошибка при редактировании сообщения', 'error');
  }
}
function updateMessageContent(messageId, newContent, isEdited = false) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) return;
  const editForm = messageEl.querySelector('.message-edit-form');
  const contentEl = messageEl.querySelector('.message-content');
  if (editForm) {
    editForm.remove();
  }
  if (contentEl) {
    contentEl.textContent = newContent;
    contentEl.style.display = '';
  }
  if (isEdited) {
    let editedLabel = messageEl.querySelector('.message-edited-label');
    if (!editedLabel) {
      editedLabel = document.createElement('span');
      editedLabel.className = 'message-edited-label';
      editedLabel.textContent = '(изменено)';
      const timestamp = messageEl.querySelector('.message-time');
      if (timestamp) {
        timestamp.appendChild(editedLabel);
      }
    }
  }
}
export async function deleteMessage(messageId) {
  if (!confirm('Удалить это сообщение?')) {
    return;
  }
  try {
    console.log('[MessageEditing] Deleting message:', messageId);
    const response = await fetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0';
      messageEl.style.transform = 'translateX(-20px)';
      setTimeout(() => messageEl.remove(), 300);
    }
    showToast('Сообщение удалено', 'success');
  } catch (error) {
    console.error('[MessageEditing] Failed to delete message:', error);
    showToast('Ошибка при удалении сообщения', 'error');
  }
}
export function canEditMessage(message) {
  const currentUser = state.getUser();
  if (!currentUser) return false;
  if (message.sender_id !== currentUser.id) return false;
  const messageTime = new Date(message.created_at).getTime();
  const now = Date.now();
  const hoursSinceCreated = (now - messageTime) / (1000 * 60 * 60);
  return hoursSinceCreated < 24;
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
  }, 3000);
}
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
export { updateMessageContent };
