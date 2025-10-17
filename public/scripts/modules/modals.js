import state from './state.js';
import { conversations as conversationsApi, users as usersApi } from './api.js';
import { escapeHtml } from './utils.js';
export function showCreateConversation() {
  const modal = createModal('Создать новый чат', `
    <form id="createChatForm">
      <div class="form-group">
        <label class="form-label">Тип чата</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" name="type" value="direct" checked>
            <span>Личное сообщение</span>
          </label>
          <label class="radio-item">
            <input type="radio" name="type" value="group">
            <span>Групповой чат</span>
          </label>
        </div>
      </div>
      <div class="form-group" id="usernameGroup">
        <label class="form-label">Имя пользователя</label>
        <input type="text" class="form-input" id="chatUsername" placeholder="Введите имя пользователя">
        <small class="form-help">Найти пользователя по имени</small>
      </div>
      <div class="form-group" id="titleGroup" style="display: none;">
        <label class="form-label">Название группы</label>
        <input type="text" class="form-input" id="chatTitle" placeholder="Моя крутая группа">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-dismiss="modal">Отмена</button>
        <button type="submit" class="btn-primary">Создать</button>
      </div>
    </form>
  `);
  const form = modal.querySelector('#createChatForm');
  const typeInputs = modal.querySelectorAll('input[name="type"]');
  const usernameGroup = modal.querySelector('#usernameGroup');
  const titleGroup = modal.querySelector('#titleGroup');
  typeInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.value === 'group') {
        usernameGroup.style.display = 'none';
        titleGroup.style.display = 'block';
      } else {
        usernameGroup.style.display = 'block';
        titleGroup.style.display = 'none';
      }
    });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = form.querySelector('input[name="type"]:checked').value;
    try {
      if (type === 'direct') {
        const usernameInput = form.querySelector('#chatUsername');
        if (!usernameInput || !usernameInput.value) {
          alert('Please enter username');
          return;
        }
        const username = usernameInput.value.trim();
        if (!username) {
          alert('Please enter username');
          return;
        }
        const { conversation } = await conversationsApi.create({
          type: 'direct',
          title: `Chat with ${username}`,
          members: [username]
        });
        state.addConversation(conversation);
        closeModal(modal);
        state.setCurrentConversation(conversation.id);
        state.emit('conversation:changed', conversation.id);
      } else {
        const titleInput = form.querySelector('#chatTitle');
        if (!titleInput || !titleInput.value) {
          alert('Пожалуйста, введите название группы');
          return;
        }
        const title = titleInput.value.trim();
        if (!title) {
          alert('Пожалуйста, введите название группы');
          return;
        }
        const { conversation } = await conversationsApi.create({
          type: 'group',
          title,
          members: []
        });
        state.addConversation(conversation);
        closeModal(modal);
        state.setCurrentConversation(conversation.id);
        state.emit('conversation:changed', conversation.id);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
      alert('Не удалось создать чат. Попробуйте снова.');
    }
  });
}
export function showAddMember(conversationId) {
  const modal = createModal('Add Member', `
    <form id="addMemberForm">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" class="form-input" id="memberUsername" placeholder="Enter username">
        <small class="form-help">Search and add user to conversation</small>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-dismiss="modal">Cancel</button>
        <button type="submit" class="btn-primary">Add</button>
      </div>
    </form>
  `);
  const form = modal.querySelector('#addMemberForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = form.querySelector('#memberUsername');
    if (!usernameInput || !usernameInput.value) {
      alert('Please enter username');
      return;
    }
    const username = usernameInput.value.trim();
    try {
      const { users } = await usersApi.search(username);
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        alert('User not found');
        return;
      }
      await conversationsApi.addMember(conversationId, user.id);
      closeModal(modal);
    } catch (error) {
      console.error('Failed to add member:', error);
      alert('Не удалось добавить участника. Попробуйте снова.');
    }
  });
}
export function showEmojiPicker(callback) {
  const emojis = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
    '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
    '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
    '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
    '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
    '✨', '⭐', '🌟', '💫', '🔥', '💥', '💯', '✅', '❌', '⚠️'
  ];
  const modal = createModal('Choose Emoji', `
    <div class="emoji-grid">
      ${emojis.map(emoji => `
        <button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
      `).join('')}
    </div>
  `);
  modal.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      callback(btn.dataset.emoji);
      closeModal(modal);
    });
  });
}
export async function showConversationInfo(conversationId, conversation) {
  const modal = createModal(conversation.title || 'Информация о беседе', `
    <div class="conversation-info-view">
      <div class="conversation-info-header">
        <div class="conversation-info-avatar" id="convInfoAvatar"></div>
        <h2 id="convInfoTitle" class="conversation-info-title"></h2>
        <p id="convInfoMeta" class="conversation-info-meta"></p>
      </div>
      ${conversation.type === 'group' ? `
        <div class="conversation-info-section">
          <h3>Описание</h3>
          <p id="convInfoDescription" class="conversation-description">Групповая беседа</p>
        </div>
      ` : ''}
      <div class="conversation-info-section">
        <h3>Участники (<span id="convInfoMemberCount">0</span>)</h3>
        <div class="conversation-members-list" id="convInfoMembersList">
          <div class="loading">Загрузка...</div>
        </div>
      </div>
    </div>
  `);
  const avatar = modal.querySelector('#convInfoAvatar');
  if (avatar) {
    if (conversation.avatar) {
      avatar.style.backgroundImage = `url(/uploads/${conversation.avatar})`;
      avatar.style.backgroundSize = 'cover';
    } else {
      avatar.style.background = `linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))`;
    }
  }
  const titleEl = modal.querySelector('#convInfoTitle');
  if (titleEl) titleEl.textContent = conversation.title || conversation.username || 'Беседа';
  try {
    const { members } = await conversationsApi.getMembers(conversationId);
    const memberCountEl = modal.querySelector('#convInfoMemberCount');
    if (memberCountEl) memberCountEl.textContent = members.length;
    const metaEl = modal.querySelector('#convInfoMeta');
    if (metaEl) {
      const onlineCount = members.filter(m => state.isUserOnline(m.user_id)).length;
      metaEl.textContent = `${onlineCount} онлайн`;
    }
    const membersList = modal.querySelector('#convInfoMembersList');
    if (membersList) {
      const { getUserColor, getUserInitials, getContrastColor } = await import('./utils.js');
      membersList.innerHTML = members.map(member => {
        const role = member.role || 'member';
        const roleEmoji = role === 'owner' ? ' 👑' : role === 'admin' ? ' ⭐' : '';
        const displayName = member.display_name || member.username || 'Unknown';
        let avatarHtml = '';
        if (member.avatar_url || member.avatar) {
          const avatarSrc = member.avatar_url || `/uploads/${member.avatar}`;
          avatarHtml = `<img src="${avatarSrc}" alt="${escapeHtml(displayName)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
        } else {
          const userColor = member.avatar_color || getUserColor(member.user_id, displayName);
          const initials = getUserInitials(displayName);
          const textColor = getContrastColor(userColor);
          avatarHtml = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${userColor}; color: ${textColor}; font-weight: 600; border-radius: 50%;">${initials}</div>`;
        }
        return `
          <div class="conversation-member-item" data-user-id="${member.user_id}" style="cursor: pointer;">
            <div class="member-avatar">${avatarHtml}</div>
            <div class="member-info">
              <span class="member-name">${escapeHtml(displayName)}${roleEmoji}</span>
              <span class="member-status">${state.isUserOnline(member.user_id) ? 'Онлайн' : 'Оффлайн'}</span>
            </div>
          </div>
        `;
      }).join('');
      const items = membersList.querySelectorAll('.conversation-member-item');
      console.log('Setting up member clicks, found:', items.length);
      items.forEach(item => {
        item.addEventListener('click', () => {
          const userId = parseInt(item.dataset.userId);
          const currentUser = state.getUser();
          console.log('Member clicked:', { userId, currentUserId: currentUser.id, conversationId });
          if (userId && userId !== currentUser.id) {
            closeModal(modal);
            showUserProfile(userId);
          }
        });
      });
    }
  } catch (error) {
    console.error('Failed to load members:', error);
    const membersList = modal.querySelector('#convInfoMembersList');
    if (membersList) {
      membersList.innerHTML = '<div class="error">Не удалось загрузить участников</div>';
    }
  }
  return modal;
}
export function showConversationMenu(conversationId, anchorEl) {
  const conversation = state.getConversation(conversationId);
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-menu';
  dropdown.style.cssText = `
    position: fixed;
    min-width: 200px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 8px 0;
    z-index: 10000;
  `;
  const rect = anchorEl.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 8}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
  const menuItems = [
    { 
      icon: '🔇', 
      label: 'Отключить уведомления', 
      action: () => toggleMute(conversationId) 
    },
    { 
      icon: '🔍', 
      label: 'Поиск в беседе', 
      action: () => searchInConversation(conversationId) 
    },
    { 
      icon: '📌', 
      label: 'Закрепить беседу', 
      action: () => pinConversation(conversationId) 
    },
    { divider: true },
    { 
      icon: '🚪', 
      label: 'Покинуть беседу', 
      action: () => leaveConversation(conversationId),
      danger: true
    }
  ];
  menuItems.forEach(item => {
    if (item.divider) {
      const divider = document.createElement('div');
      divider.style.cssText = 'height: 1px; background: var(--border-color); margin: 8px 0;';
      dropdown.appendChild(divider);
    } else {
      const menuItem = document.createElement('button');
      menuItem.className = 'dropdown-item';
      menuItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: ${item.danger ? 'var(--danger-red)' : 'var(--text-primary)'};
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      menuItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = 'var(--bg-hover)';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', () => {
        item.action();
        document.body.removeChild(dropdown);
      });
      dropdown.appendChild(menuItem);
    }
  });
  document.body.appendChild(dropdown);
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        if (document.body.contains(dropdown)) {
          document.body.removeChild(dropdown);
        }
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}
function toggleMute(conversationId) {
  const muted = localStorage.getItem(`muted_${conversationId}`) === 'true';
  localStorage.setItem(`muted_${conversationId}`, !muted);
  showToast(muted ? 'Уведомления включены' : 'Уведомления отключены', 'success');
}
function searchInConversation(conversationId) {
  showToast('Поиск в беседе скоро будет доступен', 'info');
}
function pinConversation(conversationId) {
  const pinned = localStorage.getItem(`pinned_${conversationId}`) === 'true';
  localStorage.setItem(`pinned_${conversationId}`, !pinned);
  showToast(pinned ? 'Беседа откреплена' : 'Беседа закреплена', 'success');
}
async function leaveConversation(conversationId) {
  if (!confirm('Вы уверены, что хотите покинуть эту беседу?')) {
    return;
  }
  try {
    showToast('Вы покинули беседу', 'success');
    state.removeConversation(conversationId);
  } catch (error) {
    showToast('Не удалось покинуть беседу', 'error');
  }
}
export function showRoleMenu(conversationId, member, anchorEl) {
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-menu';
  dropdown.style.cssText = `
    position: fixed;
    min-width: 200px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 8px 0;
    z-index: 10000;
  `;
  const rect = anchorEl.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 8}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
  const currentRole = member.role || 'member';
  const menuItems = [];
  if (currentRole === 'member') {
    menuItems.push({ 
      icon: '⭐', 
      label: 'Назначить админом', 
      action: () => changeRole(conversationId, member.user_id, 'admin') 
    });
  } else if (currentRole === 'admin') {
    menuItems.push({ 
      icon: '👤', 
      label: 'Снять админа', 
      action: () => changeRole(conversationId, member.user_id, 'member') 
    });
  }
  menuItems.push({ divider: true });
  menuItems.push({ 
    icon: '🚫', 
    label: 'Удалить из беседы', 
    action: () => removeMember(conversationId, member.user_id, member.username),
    danger: true
  });
  menuItems.forEach(item => {
    if (item.divider) {
      const divider = document.createElement('div');
      divider.style.cssText = 'height: 1px; background: var(--border-color); margin: 8px 0;';
      dropdown.appendChild(divider);
    } else {
      const menuItem = document.createElement('button');
      menuItem.className = 'dropdown-item';
      menuItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: ${item.danger ? 'var(--danger-red)' : 'var(--text-primary)'};
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      menuItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = 'var(--bg-hover)';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', () => {
        item.action();
        document.body.removeChild(dropdown);
      });
      dropdown.appendChild(menuItem);
    }
  });
  document.body.appendChild(dropdown);
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        if (document.body.contains(dropdown)) {
          document.body.removeChild(dropdown);
        }
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}
async function changeRole(conversationId, userId, newRole) {
  try {
    const { conversations } = await import('./api.js');
    await conversations.updateMemberRole(conversationId, userId, newRole);
    const roleText = newRole === 'admin' ? 'админом' : 'участником';
    showToast(`Пользователь назначен ${roleText}`, 'success');
    state.emit('conversation:changed', conversationId);
  } catch (error) {
    console.error('Failed to change role:', error);
    showToast('Не удалось изменить роль', 'error');
  }
}
async function removeMember(conversationId, userId, username) {
  if (!confirm(`Удалить ${username} из беседы?`)) {
    return;
  }
  try {
    const { conversations } = await import('./api.js');
    await conversations.removeMember(conversationId, userId);
    showToast(`${username} удален из беседы`, 'success');
    state.emit('conversation:changed', conversationId);
  } catch (error) {
    console.error('Failed to remove member:', error);
    showToast('Не удалось удалить участника', 'error');
  }
}
function createModal(title, content) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" data-dismiss="modal">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(overlay);
    }
  });
  overlay.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(overlay));
  });
  setTimeout(() => {
    const firstInput = overlay.querySelector('input, textarea, button');
    if (firstInput) firstInput.focus();
  }, 100);
  return overlay;
}
function createContextMenu(items, anchorEl) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.innerHTML = items
    .filter(item => item.visible !== false)
    .map(item => {
      if (item.divider) {
        return '<div class="menu-divider"></div>';
      }
      return `
        <button class="menu-item ${item.danger ? 'danger' : ''}">
          ${item.label}
        </button>
      `;
    })
    .join('');
  document.body.appendChild(menu);
  let itemIndex = 0;
  menu.querySelectorAll('.menu-item').forEach(btn => {
    const item = items.filter(i => !i.divider)[itemIndex++];
    btn.addEventListener('click', () => {
      item.action();
      closeMenu(menu);
    });
  });
  setTimeout(() => {
    document.addEventListener('click', function closeOnOutside(e) {
      if (!menu.contains(e.target)) {
        closeMenu(menu);
        document.removeEventListener('click', closeOnOutside);
      }
    });
  }, 0);
  return menu;
}
function closeModal(modal) {
  modal.classList.add('closing');
  setTimeout(() => {
    modal.remove();
  }, 200);
}
function closeMenu(menu) {
  menu.remove();
}
function confirmLeave(conversationId) {
  if (confirm('Are you sure you want to leave this conversation?')) {
    console.log('Leave conversation:', conversationId);
  }
}
export function showUserProfile(userId) {
  const modal = createModal('', `
    <div class="user-profile-card">
      <!-- Cover/Banner -->
      <div class="profile-cover" id="userProfileCover">
        <div class="profile-cover-gradient"></div>
      </div>
      <!-- Avatar and basic info -->
      <div class="profile-main-section">
        <div class="profile-avatar-wrapper">
          <div class="profile-avatar-large" id="userProfileAvatar"></div>
          <div class="profile-status-indicator" id="userProfileOnlineStatus"></div>
        </div>
        <div class="profile-identity">
          <h2 id="userProfileName" class="profile-display-name"></h2>
          <p id="userProfileUsername" class="profile-username-text"></p>
        </div>
        <p id="userProfileStatus" class="profile-status-message"></p>
      </div>
      <!-- Action buttons -->
      <div class="profile-actions-row">
        <button class="profile-action-btn primary" id="sendMessageBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Написать</span>
        </button>
        <button class="profile-action-btn" id="startCallBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <span>Позвонить</span>
        </button>
      </div>
      <!-- Info sections -->
      <div class="profile-info-sections">
        <!-- Bio section -->
        <div class="profile-info-block" id="bioBlock">
          <div class="profile-info-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>О пользователе</span>
          </div>
          <p id="userProfileBio" class="profile-info-text"></p>
        </div>
        <!-- Username section -->
        <div class="profile-info-block">
          <div class="profile-info-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            <span>Имя пользователя</span>
          </div>
          <p class="profile-info-text" id="userProfileUsernameInfo"></p>
        </div>
        <!-- Registration date -->
        <div class="profile-info-block" id="registrationBlock">
          <div class="profile-info-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Дата регистрации</span>
          </div>
          <p id="userProfileRegistrationDate" class="profile-info-text"></p>
        </div>
        <!-- Common groups -->
        <div class="profile-info-block" id="commonGroupsBlock" style="display: none;">
          <div class="profile-info-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Общие беседы</span>
          </div>
          <div id="commonGroupsList" class="profile-common-groups"></div>
        </div>
      </div>
    </div>
  `);
  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) titleEl.style.display = 'none';
  loadUserProfile(modal, userId);
  return modal;
}
async function loadUserProfile(modal, userId) {
  try {
    const response = await usersApi.getById(userId);
    const user = response.user;
    let profile = null;
    try {
      const profileResponse = await fetch(`/api/users/${userId}/profile`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        profile = profileData.profile;
      }
    } catch (error) {
      console.warn('[UserProfile] Failed to load V2 profile:', error);
    }
    const { getUserColor, getUserInitials, getContrastColor } = await import('./utils.js');
    const userColor = user.avatarColor || getUserColor(user.id, user.username);
    const userInitials = getUserInitials(user.displayName || user.username);
    const cover = modal.querySelector('#userProfileCover');
    if (cover) {
      cover.style.background = `linear-gradient(135deg, ${userColor}, ${adjustColorBrightness(userColor, -20)})`;
    }
    const avatar = modal.querySelector('#userProfileAvatar');
    if (avatar) {
      if (user.avatar) {
        avatar.innerHTML = `<img src="/uploads/${user.avatar}" alt="${user.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
      } else {
        avatar.style.background = userColor;
        avatar.innerHTML = `<span style="color: ${getContrastColor(userColor)}; font-size: 48px; font-weight: 600;">${userInitials}</span>`;
      }
    }
    const statusIndicator = modal.querySelector('#userProfileOnlineStatus');
    if (statusIndicator) {
      statusIndicator.style.display = 'none';
    }
    const nameEl = modal.querySelector('#userProfileName');
    if (nameEl) {
      nameEl.textContent = user.display_name || user.username;
      nameEl.style.color = userColor;
    }
    const usernameEl = modal.querySelector('#userProfileUsername');
    if (usernameEl) usernameEl.textContent = `@${user.username}`;
    const usernameInfoEl = modal.querySelector('#userProfileUsernameInfo');
    if (usernameInfoEl) usernameInfoEl.textContent = user.username;
    const statusEl = modal.querySelector('#userProfileStatus');
    if (statusEl) {
      const statusText = profile?.status || user.status_message;
      if (statusText) {
        const moodText = profile?.mood ? ` ${profile.mood}` : '';
        statusEl.textContent = statusText + moodText;
        statusEl.style.display = 'block';
      } else {
        statusEl.style.display = 'none';
      }
    }
    const bioEl = modal.querySelector('#userProfileBio');
    const bioBlock = modal.querySelector('#bioBlock');
    if (bioEl && bioBlock) {
      const bioText = profile?.bio || user.bio;
      if (bioText) {
        bioEl.textContent = bioText;
        bioBlock.style.display = 'flex';
      } else {
        bioBlock.style.display = 'none';
      }
    }
    const regDateEl = modal.querySelector('#userProfileRegistrationDate');
    const regBlock = modal.querySelector('#registrationBlock');
    if (regDateEl && regBlock) {
      if (user.created_at) {
        const date = new Date(user.created_at);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        regDateEl.textContent = date.toLocaleDateString('ru-RU', options);
        regBlock.style.display = 'flex';
      } else {
        regBlock.style.display = 'none';
      }
    }
    const sendBtn = modal.querySelector('#sendMessageBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        try {
          console.log('[UserProfile] Opening conversation with', user.username);
          const conv = await conversationsApi.create({
            type: 'direct',
            username: user.username
          });
          console.log('[UserProfile] Conversation created/found:', conv);
          closeModal(modal);
          const conversationsList = await conversationsApi.getAll();
          state.setConversations(conversationsList);
          await new Promise(resolve => setTimeout(resolve, 100));
          state.setCurrentConversation(conv.id);
          console.log('[UserProfile] Switched to conversation:', conv.id);
          showToast(`Чат с ${user.displayName || user.username} открыт`, 'success');
        } catch (error) {
          console.error('Failed to open conversation:', error);
          showToast('Не удалось открыть чат', 'error');
        }
      });
    }
    const callBtn = modal.querySelector('#startCallBtn');
    if (callBtn) {
      callBtn.addEventListener('click', async () => {
        try {
          const conv = await conversationsApi.create({
            type: 'direct',
            username: user.username
          });
          closeModal(modal);
          state.setCurrentConversation(conv.id);
          const { startCall } = await import('./webrtc.js');
          startCall(conv.id, 'audio');
          showToast('Вызов начат...', 'info');
        } catch (error) {
          console.error('Failed to start call:', error);
          showToast('Не удалось начать вызов', 'error');
        }
      });
    }
    loadCommonGroups(modal, userId);
  } catch (error) {
    console.error('Failed to load user profile:', error);
    showToast('Не удалось загрузить профиль', 'error');
  }
}
function adjustColorBrightness(hex, percent) {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.max(0, Math.min(255, r + (r * percent / 100)));
  g = Math.max(0, Math.min(255, g + (g * percent / 100)));
  b = Math.max(0, Math.min(255, b + (b * percent / 100)));
  const rr = Math.round(r).toString(16).padStart(2, '0');
  const gg = Math.round(g).toString(16).padStart(2, '0');
  const bb = Math.round(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}
async function loadCommonGroups(modal, userId) {
  try {
    const commonGroupsBlock = modal.querySelector('#commonGroupsBlock');
    if (commonGroupsBlock) {
      commonGroupsBlock.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to load common groups:', error);
  }
}
function getInitials(username) {
  if (!username) return '?';
  const parts = username.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.substring(0, 2).toUpperCase();
}
export function showProfileSettings() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  const currentUser = state.getCurrentUser();
  if (!currentUser) return;
  const form = modal.querySelector('#profileForm');
  if (form) {
    const displayNameInput = form.querySelector('[name="displayName"]');
    const statusInput = form.querySelector('[name="statusMessage"]');
    const bioInput = form.querySelector('[name="bio"]');
    const usernameDisplay = modal.querySelector('#profileUsername');
    const avatarPreview = modal.querySelector('#profileAvatarPreview');
    if (displayNameInput) displayNameInput.value = currentUser.displayName || '';
    if (statusInput) statusInput.value = currentUser.statusMessage || '';
    if (bioInput) bioInput.value = currentUser.bio || '';
    if (usernameDisplay) usernameDisplay.value = `@${currentUser.username}`;
    if (avatarPreview) {
      if (currentUser.avatarUrl) {
        avatarPreview.style.backgroundImage = `url(${currentUser.avatarUrl})`;
        avatarPreview.style.backgroundSize = 'cover';
        avatarPreview.style.backgroundPosition = 'center';
      } else {
        avatarPreview.style.background = currentUser.avatarColor || '#00E5FF';
      }
    }
    updateCharCounter(statusInput, 'statusCharCount');
    updateCharCounter(bioInput, 'bioCharCount');
    statusInput?.addEventListener('input', () => updateCharCounter(statusInput, 'statusCharCount'));
    bioInput?.addEventListener('input', () => updateCharCounter(bioInput, 'bioCharCount'));
  }
  setupProfileTabs(modal);
  setupAvatarUpload(modal);
  setupProfileFormSubmit(modal);
  setupThemeSelector(modal);
  setupColorPicker(modal);
  modal.classList.remove('hidden');
  modal.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}
function setupProfileTabs(modal) {
  const tabs = modal.querySelectorAll('.profile-tab');
  const contents = modal.querySelectorAll('.profile-tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetContent = modal.querySelector(`[data-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}
function setupAvatarUpload(modal) {
  const uploadBtn = modal.querySelector('#uploadAvatarBtn');
  const editBtn = modal.querySelector('#profileAvatarEditBtn');
  const input = modal.querySelector('#profileAvatarInput');
  const removeBtn = modal.querySelector('#profileAvatarRemoveBtn');
  const preview = modal.querySelector('#profileAvatarPreview');
  if (uploadBtn && input) {
    uploadBtn.addEventListener('click', () => input.click());
  }
  if (editBtn && input) {
    editBtn.addEventListener('click', () => input.click());
  }
  if (input && preview) {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.style.backgroundImage = `url(${ev.target.result})`;
          preview.style.backgroundSize = 'cover';
          preview.style.backgroundPosition = 'center';
          if (removeBtn) removeBtn.dataset.removed = 'false';
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (removeBtn && preview) {
    removeBtn.addEventListener('click', () => {
      const currentUser = state.getCurrentUser();
      preview.style.backgroundImage = 'none';
      preview.style.background = currentUser?.avatarColor || '#00E5FF';
      if (input) input.value = '';
      removeBtn.dataset.removed = 'true';
    });
  }
}
function setupProfileFormSubmit(modal) {
  const form = modal.querySelector('#profileForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData(form);
      const data = {
        displayName: formData.get('displayName'),
        statusMessage: formData.get('statusMessage') || '',
        bio: formData.get('bio') || ''
      };
      const avatarInput = modal.querySelector('#profileAvatarInput');
      const removeBtn = modal.querySelector('#profileAvatarRemoveBtn');
      if (avatarInput?.files?.length > 0) {
        showToast('Загрузка аватара...', 'info');
        const avatarFile = avatarInput.files[0];
        const uploadFormData = new FormData();
        uploadFormData.append('file', avatarFile);
        const response = await fetch('/api/uploads', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('token')}`
          },
          body: uploadFormData
        });
        if (!response.ok) {
          throw new Error('Не удалось загрузить аватар');
        }
        const { attachment } = await response.json();
        data.avatarAttachmentId = attachment.id;
      } else if (removeBtn?.dataset.removed === 'true') {
        data.removeAvatar = true;
      }
      const { user } = await usersApi.updateProfile(data);
      state.setCurrentUser(user);
      modal.classList.add('hidden');
      showToast('Профиль успешно обновлён!', 'success');
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar && user.avatarUrl) {
        userAvatar.style.backgroundImage = `url(${user.avatarUrl})`;
        userAvatar.style.backgroundSize = 'cover';
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      showToast('Не удалось обновить профиль: ' + (error.message || 'Неизвестная ошибка'), 'error');
    }
  });
}
function setupThemeSelector(modal) {
  const themeCards = modal.querySelectorAll('.theme-card');
  const currentTheme = localStorage.getItem('theme') || 'dark';
  themeCards.forEach(card => {
    if (card.dataset.theme === currentTheme) {
      card.classList.add('active');
    }
  });
  themeCards.forEach(card => {
    card.addEventListener('click', () => {
      themeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const theme = card.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('theme', theme);
      showToast(`Тема изменена на ${theme === 'dark' ? 'тёмную' : theme === 'light' ? 'светлую' : 'авто'}`, 'success');
    });
  });
}
function applyTheme(theme) {
  if (theme === 'auto') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
function setupColorPicker(modal) {
  const swatches = modal.querySelectorAll('.color-swatch');
  const currentColor = localStorage.getItem('accentColor') || '#00E5FF';
  swatches.forEach(swatch => {
    if (swatch.dataset.color === currentColor) {
      swatch.classList.add('active');
    }
  });
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      document.documentElement.style.setProperty('--accent-cyan', color);
      localStorage.setItem('accentColor', color);
      showToast('Accent color changed', 'success');
    });
  });
}
function updateCharCounter(input, counterId) {
  if (!input) return;
  const counter = document.getElementById(counterId);
  if (counter) {
    counter.textContent = input.value.length;
  }
}
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 24px',
    background: type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6',
    color: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.32)',
    zIndex: '3000',
    animation: 'slideInRight 300ms ease-out',
    fontSize: '14px',
    fontWeight: '500'
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 300ms ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
export function showStickerPicker() {
  const modal = document.getElementById('stickerModal');
  if (!modal) return;
  setupStickerTabs(modal);
  setupStickerSearch(modal);
  setupStickerClicks(modal);
  setupStickerFavorites(modal);
  loadRecentStickers(modal);
  modal.classList.remove('hidden');
  modal.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}
function setupStickerTabs(modal) {
  const tabs = modal.querySelectorAll('.sticker-tab');
  const packs = modal.querySelectorAll('.sticker-pack');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const packName = tab.dataset.pack;
      tabs.forEach(t => t.classList.remove('active'));
      packs.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPack = modal.querySelector(`[data-pack-content="${packName}"]`);
      if (targetPack) {
        targetPack.classList.add('active');
      }
    });
  });
}
function setupStickerSearch(modal) {
  const searchInput = modal.querySelector('#stickerSearchInput');
  if (!searchInput) return;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const allItems = modal.querySelectorAll('.sticker-item');
    if (!query) {
      allItems.forEach(item => item.style.display = 'flex');
      return;
    }
    allItems.forEach(item => {
      const title = item.getAttribute('title')?.toLowerCase() || '';
      if (title.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });
}
function setupStickerClicks(modal) {
  const stickerItems = modal.querySelectorAll('.sticker-item');
  stickerItems.forEach(item => {
    item.addEventListener('click', () => {
      const sticker = item.dataset.sticker;
      if (sticker) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
          const currentValue = messageInput.value;
          messageInput.value = currentValue + sticker;
          messageInput.focus();
        }
        saveRecentSticker(sticker);
        modal.classList.add('hidden');
        showToast('Стикер добавлен! 🎨', 'success');
      }
    });
  });
}
function setupStickerFavorites(modal) {
  const favButtons = modal.querySelectorAll('.btn-favorite');
  favButtons.forEach(btn => {
    const packName = btn.dataset.pack;
    const favorites = JSON.parse(localStorage.getItem('favoriteStickerPacks') || '[]');
    if (favorites.includes(packName)) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      const favorites = JSON.parse(localStorage.getItem('favoriteStickerPacks') || '[]');
      if (favorites.includes(packName)) {
        const index = favorites.indexOf(packName);
        favorites.splice(index, 1);
        btn.classList.remove('active');
        showToast('Removed from favorites', 'info');
      } else {
        favorites.push(packName);
        btn.classList.add('active');
        showToast('Added to favorites ❤️', 'success');
      }
      localStorage.setItem('favoriteStickerPacks', JSON.stringify(favorites));
    });
  });
}
function saveRecentSticker(sticker) {
  const recent = JSON.parse(localStorage.getItem('recentStickers') || '[]');
  const index = recent.indexOf(sticker);
  if (index > -1) {
    recent.splice(index, 1);
  }
  recent.unshift(sticker);
  if (recent.length > 16) {
    recent.pop();
  }
  localStorage.setItem('recentStickers', JSON.stringify(recent));
}
function loadRecentStickers(modal) {
  const recentContainer = modal.querySelector('#recentStickers');
  if (!recentContainer) return;
  const recent = JSON.parse(localStorage.getItem('recentStickers') || '[]');
  if (recent.length === 0) {
    return;
  }
  recentContainer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'sticker-grid';
  recent.forEach(sticker => {
    const btn = document.createElement('button');
    btn.className = 'sticker-item';
    btn.dataset.sticker = sticker;
    btn.textContent = sticker;
    btn.title = 'Recent';
    btn.addEventListener('click', () => {
      const messageInput = document.getElementById('messageInput');
      if (messageInput) {
        messageInput.value += sticker;
        messageInput.focus();
      }
      modal.classList.add('hidden');
      showToast('Стикер добавлен! 🎨', 'success');
    });
    grid.appendChild(btn);
  });
  recentContainer.appendChild(grid);
}
