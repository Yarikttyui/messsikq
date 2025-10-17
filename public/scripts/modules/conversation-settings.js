import state from './state.js';
import socket from './socket.js';
import { conversations as conversationsApi } from './api.js';
import { getUserColor, getUserInitials, escapeHtml, generateUserAvatar } from './utils.js';
import { showMembersModal } from './conversations/conversation-members.js';
import { showBackgroundCustomizer } from './conversations/chat-backgrounds.js';
export async function showConversationSettings(conversationId) {
  try {
    const conversation = state.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    const currentUser = state.getUser();
    let members = state.getMembers(conversationId) || [];
    if (members.length === 0) {
      try {
        const response = await conversationsApi.getMembers(conversationId);
        members = response.members || [];
        state.setMembers(conversationId, members);
      } catch (error) {
        console.error('[ConversationSettings] Failed to load members:', error);
      }
    }
    const currentMember = members.find(m => m.user_id === currentUser.id);
    const canEdit = conversation.type === 'group' && currentMember && ['owner', 'admin'].includes(currentMember.role);
    console.log('[ConversationSettings] Current user:', currentUser.id);
    console.log('[ConversationSettings] Current member:', currentMember);
    console.log('[ConversationSettings] Conversation type:', conversation.type);
    console.log('[ConversationSettings] Can edit:', canEdit);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container conversation-settings-modal">
        <div class="modal-header">
          <h2 class="modal-title">Настройки беседы</h2>
          <button class="modal-close-btn" id="closeSettingsBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- Аватар беседы -->
          ${conversation.type === 'group' ? `
            <div class="conversation-avatar-section">
              <div class="conversation-avatar-preview" id="convAvatarPreview">
                ${conversation.avatarUrl ? `
                  <img src="${conversation.avatarUrl}" alt="Avatar" />
                ` : `
                  <div class="conversation-avatar-placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                `}
              </div>
              ${canEdit ? `
                <button class="btn-secondary" id="changeAvatarBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  Изменить фото
                </button>
                <input type="file" id="avatarFileInput" accept="image/*" style="display: none;" />
              ` : ''}
            </div>
          ` : ''}
          <!-- Участники -->
          <div class="settings-section">
            <h3 class="section-title">Участники</h3>
            <div class="participants-list" id="participantsList"></div>
            ${canEdit ? '<button class="btn-primary btn-add-member" id="addMemberBtn">Добавить участника</button>' : ''}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    await loadParticipants(conversationId, canEdit);
    setupSettingsEventListeners(modal, conversationId, canEdit);
  } catch (error) {
    console.error('[ConversationSettings] Error:', error);
  }
}
async function loadParticipants(conversationId, canEdit) {
  try {
    const { members } = await conversationsApi.getMembers(conversationId);
    const currentUser = state.getUser();
    const participantsList = document.getElementById('participantsList');
    if (!participantsList) return;
    participantsList.innerHTML = members.map(member => {
      const userId = member.id || member.user_id;
      const isCurrentUser = userId === currentUser.id;
      const userColor = member.avatarColor || member.avatar_color || getUserColor(userId, member.username);
      const userInitials = getUserInitials(member.displayName || member.display_name || member.username);
      const isOnline = state.isUserOnline(userId);
      const roleText = member.role === 'owner' ? 'Владелец' : member.role === 'admin' ? 'Админ' : 'Участник';
      const roleEmoji = member.role === 'owner' ? '👑' : member.role === 'admin' ? '⭐' : '';
      return `
        <div class="participant-item" data-user-id="${userId}">
          <div class="participant-avatar" style="background: ${userColor};">
            ${(member.avatarUrl || member.avatar_url) ? `
              <img src="${member.avatarUrl || member.avatar_url}" alt="${escapeHtml(member.username)}" />
            ` : `
              <span class="user-avatar-initials">${userInitials}</span>
            `}
            ${isOnline ? '<div class="online-indicator"></div>' : ''}
          </div>
          <div class="participant-info">
            <div class="participant-name" style="color: ${userColor};">
              ${escapeHtml(member.displayName || member.display_name || member.username)}
              ${isCurrentUser ? '<span class="badge-you">Вы</span>' : ''}
            </div>
            <div class="participant-role">${roleEmoji} ${roleText}</div>
          </div>
          ${canEdit && !isCurrentUser && member.role !== 'owner' ? `
            <div class="participant-actions">
              <button class="btn-icon" data-action="change-role" data-user-id="${userId}" title="Изменить роль">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
              <button class="btn-icon btn-danger" data-action="remove" data-user-id="${userId}" title="Удалить">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    if (canEdit) {
      participantsList.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const userId = parseInt(btn.dataset.userId);
          if (action === 'remove') {
            await removeMember(conversationId, userId);
          } else if (action === 'change-role') {
            await changeRole(conversationId, userId);
          }
        });
      });
    }
    participantsList.querySelectorAll('.participant-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('button') || e.target.closest('.participant-actions')) {
          return;
        }
        const userId = parseInt(item.dataset.userId, 10);
        if (!userId || isNaN(userId)) {
          console.error('[ConversationSettings] Invalid user ID:', item.dataset.userId);
          return;
        }
        const { showUserProfile } = await import('./modals.js');
        showUserProfile(userId);
      });
    });
  } catch (error) {
    console.error('[ConversationSettings] Failed to load participants:', error);
  }
}
function setupEventHandlers(modal, conversation, conversationId, canEdit) {
  const closeBtn = modal.querySelector('#closeSettingsBtn');
  const cancelBtn = modal.querySelector('#cancelSettingsBtn');
  [closeBtn, cancelBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        modal.remove();
      });
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  if (!canEdit) return;
  const changeAvatarBtn = modal.querySelector('#changeAvatarBtn');
  const avatarFileInput = modal.querySelector('#avatarFileInput');
  if (changeAvatarBtn && avatarFileInput) {
    changeAvatarBtn.addEventListener('click', () => {
      avatarFileInput.click();
    });
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await uploadConversationAvatar(conversationId, file);
      }
    });
  }
  const copyBtn = modal.querySelector('#copyShareCodeBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const shareCode = conversation.shareCode;
      navigator.clipboard.writeText(shareCode).then(() => {
        showToast('Код скопирован', 'success');
      });
    });
  }
  const changeBackgroundBtn = modal.querySelector('#changeBackgroundBtn');
  if (changeBackgroundBtn) {
    changeBackgroundBtn.addEventListener('click', () => {
      modal.remove(); // Закрываем настройки
      showBackgroundCustomizer(conversationId); // Открываем новый модуль
    });
  }
  const manageMembersBtn = modal.querySelector('#manageMembersBtn');
  if (manageMembersBtn) {
    manageMembersBtn.addEventListener('click', () => {
      modal.remove(); // Закрываем настройки
      showMembersModal(conversationId); // Открываем новый модуль
    });
  }
  const saveBtn = modal.querySelector('#saveSettingsBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveConversationSettings(modal, conversationId);
    });
  }
}
async function saveConversationSettings(modal, conversationId) {
  try {
    const titleInput = modal.querySelector('#convTitleInput');
    const descriptionInput = modal.querySelector('#convDescriptionInput');
    const privateCheckbox = modal.querySelector('#convPrivateCheckbox');
    const updates = {
      title: titleInput?.value.trim(),
      description: descriptionInput?.value.trim(),
      isPrivate: privateCheckbox?.checked || false
    };
    socket.socket.emit('conversation:update', {
      conversationId,
      ...updates
    }, (response) => {
      if (response.ok) {
        showToast('Настройки сохранены', 'success');
        modal.remove();
        state.updateConversation(conversationId, updates);
      } else {
        showToast(response.message || 'Не удалось сохранить настройки', 'error');
      }
    });
  } catch (error) {
    console.error('[ConversationSettings] Failed to save:', error);
    showToast('Ошибка при сохранении', 'error');
  }
}
async function uploadConversationAvatar(conversationId, file) {
  try {
    showToast('Загрузка фото...', 'info');
    const token = sessionStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    const data = await response.json();
    const attachmentId = data.attachment?.id;
    if (!attachmentId) {
      throw new Error('No attachment ID');
    }
    socket.socket.emit('conversation:update', {
      conversationId,
      avatarAttachmentId: attachmentId
    }, (res) => {
      if (res.ok) {
        showToast('Фото обновлено', 'success');
        const preview = document.getElementById('convAvatarPreview');
        if (preview && data.attachment.url) {
          preview.innerHTML = `<img src="${data.attachment.url}" alt="Avatar" />`;
        }
      } else {
        showToast(res.message || 'Не удалось обновить фото', 'error');
      }
    });
  } catch (error) {
    console.error('[ConversationSettings] Failed to upload avatar:', error);
    showToast('Ошибка загрузки фото', 'error');
  }
}
async function removeMember(conversationId, userId) {
  if (!confirm('Удалить участника из беседы?')) return;
  try {
    socket.socket.emit('conversation:remove-member', {
      conversationId,
      userId
    }, (response) => {
      if (response.ok) {
        showToast('Участник удален', 'success');
        loadParticipants(conversationId, true);
      } else {
        showToast(response.message || 'Не удалось удалить участника', 'error');
      }
    });
  } catch (error) {
    console.error('[ConversationSettings] Failed to remove member:', error);
    showToast('Ошибка при удалении', 'error');
  }
}
async function changeRole(conversationId, userId) {
  const newRole = prompt('Выберите роль (admin/member):');
  if (!newRole || !['admin', 'member'].includes(newRole)) return;
  try {
    socket.socket.emit('conversation:change-role', {
      conversationId,
      userId,
      role: newRole
    }, (response) => {
      if (response.ok) {
        showToast('Роль изменена', 'success');
        loadParticipants(conversationId, true);
      } else {
        showToast(response.message || 'Не удалось изменить роль', 'error');
      }
    });
  } catch (error) {
    console.error('[ConversationSettings] Failed to change role:', error);
    showToast('Ошибка при изменении роли', 'error');
  }
}
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
function initSocketListeners() {
  socket.socket.on('conversation:updated', (conversation) => {
    console.log('[ConversationSettings] Conversation updated:', conversation);
    const currentConv = state.getActiveConversation();
    if (currentConv && currentConv.id === conversation.id) {
      Object.assign(currentConv, conversation);
      const modal = document.getElementById('conversationSettingsModal');
      if (modal && !modal.classList.contains('hidden')) {
        const avatarImg = modal.querySelector('.conversation-avatar-preview img');
        if (avatarImg && conversation.avatarUrl) {
          avatarImg.src = conversation.avatarUrl;
        }
        const titleInput = modal.querySelector('#conversationTitle');
        if (titleInput) {
          titleInput.value = conversation.title || '';
        }
        const descInput = modal.querySelector('#conversationDescription');
        if (descInput) {
          descInput.value = conversation.description || '';
        }
        const privateCheckbox = modal.querySelector('#conversationIsPrivate');
        if (privateCheckbox) {
          privateCheckbox.checked = conversation.isPrivate;
        }
      }
      const headerTitle = document.querySelector('.conversation-header-title');
      if (headerTitle) {
        headerTitle.textContent = conversation.title;
      }
      const headerAvatar = document.querySelector('.conversation-header-avatar img');
      if (headerAvatar && conversation.avatarUrl) {
        headerAvatar.src = conversation.avatarUrl;
      }
    }
  });
  socket.socket.on('conversation:member-removed', ({ conversationId, userId, removedBy }) => {
    console.log('[ConversationSettings] Member removed:', { conversationId, userId, removedBy });
    const currentConv = state.getActiveConversation();
    if (currentConv && currentConv.id === conversationId) {
      const currentUser = state.getUser();
      if (currentUser && currentUser.id === userId) {
        const modal = document.getElementById('conversationSettingsModal');
        if (modal) {
          modal.classList.add('hidden');
        }
        showToast('Вы были удалены из беседы', 'warning');
        return;
      }
      const modal = document.getElementById('conversationSettingsModal');
      if (modal && !modal.classList.contains('hidden')) {
        loadParticipants(conversationId, true);
      }
    }
  });
  socket.socket.on('conversation:role-changed', ({ conversationId, userId, role, changedBy }) => {
    console.log('[ConversationSettings] Role changed:', { conversationId, userId, role, changedBy });
    const currentConv = state.getActiveConversation();
    if (currentConv && currentConv.id === conversationId) {
      const modal = document.getElementById('conversationSettingsModal');
      if (modal && !modal.classList.contains('hidden')) {
        loadParticipants(conversationId, true);
      }
      const currentUser = state.getUser();
      if (currentUser && currentUser.id === userId) {
        const roleNames = {
          owner: 'Владелец',
          admin: 'Администратор',
          member: 'Участник'
        };
        showToast(`Ваша роль изменена на: ${roleNames[role] || role}`, 'info');
      }
    }
  });
}
initSocketListeners();
