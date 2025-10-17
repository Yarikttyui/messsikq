import state from '../state.js';
import socket from '../socket.js';
import { getUserColor, getUserInitials } from '../utils.js';
import { showUserProfile } from '../modals.js';
export function showMembersModal(conversationId) {
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (!conversation) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container members-modal">
      <div class="modal-header">
        <h2 class="modal-title">Участники (${conversation.memberCount || 0})</h2>
        <button class="modal-close-btn" id="closeMembersModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="members-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input 
            type="text" 
            id="membersSearchInput" 
            placeholder="Поиск участников..." 
            autocomplete="off"
          />
        </div>
        <div class="members-list" id="membersList">
          <div class="loading-spinner">
            <div class="spinner"></div>
            Загрузка участников...
          </div>
        </div>
      </div>
      <div class="modal-footer">
        ${conversation.isAdmin || conversation.role === 'admin' ? `
          <button class="btn-secondary" id="addMemberBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Добавить участника
          </button>
        ` : ''}
        <button class="btn-primary" id="closeMembersBtn">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const closeBtn = modal.querySelector('#closeMembersModal');
  const closeFooterBtn = modal.querySelector('#closeMembersBtn');
  const addMemberBtn = modal.querySelector('#addMemberBtn');
  const searchInput = modal.querySelector('#membersSearchInput');
  const membersList = modal.querySelector('#membersList');
  const closeModal = () => modal.remove();
  closeBtn.addEventListener('click', closeModal);
  closeFooterBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  loadMembers(conversationId, membersList);
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterMembers(e.target.value.trim().toLowerCase(), membersList);
    }, 300);
  });
  if (addMemberBtn) {
    addMemberBtn.addEventListener('click', () => {
      showAddMemberModal(conversationId);
    });
  }
}
async function loadMembers(conversationId, container) {
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/conversations/${conversationId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to load members');
    const members = await response.json();
    renderMembers(members, container, conversationId);
  } catch (error) {
    console.error('[Members] Load error:', error);
    container.innerHTML = `
      <div class="error-message">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Не удалось загрузить участников</p>
      </div>
    `;
  }
}
function renderMembers(members, container, conversationId) {
  const conversation = state.conversations.find(c => c.id === conversationId);
  const currentUserId = state.currentUser?.id;
  const isAdmin = conversation?.isAdmin || conversation?.role === 'admin';
  if (!members || members.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет участников</div>';
    return;
  }
  members.sort((a, b) => {
    const aOnline = state.onlineUsers.has(a.id || a.user_id) ? 1 : 0;
    const bOnline = state.onlineUsers.has(b.id || b.user_id) ? 1 : 0;
    if (aOnline !== bOnline) return bOnline - aOnline;
    return (a.username || a.name || '').localeCompare(b.username || b.name || '');
  });
  container.innerHTML = members.map(member => {
    const userId = member.id || member.user_id;
    const username = member.username || member.name || 'Unknown';
    const role = member.role || 'member';
    const isOnline = state.onlineUsers.has(userId);
    const isSelf = userId === currentUserId;
    const color = getUserColor(userId);
    const initials = getUserInitials(username);
    return `
      <div class="member-item" data-user-id="${userId}" data-username="${username}">
        <div class="member-avatar-wrapper">
          <div class="member-avatar" style="background: ${color}">
            ${member.avatar_url ? 
              `<img src="${member.avatar_url}" alt="${username}">` : 
              `<span>${initials}</span>`
            }
          </div>
          ${isOnline ? '<div class="online-badge"></div>' : ''}
        </div>
        <div class="member-info">
          <div class="member-name">
            ${username}
            ${isSelf ? '<span class="self-badge">Вы</span>' : ''}
          </div>
          <div class="member-status">
            ${isOnline ? 'В сети' : 'Не в сети'}
            ${role === 'admin' ? ' • Администратор' : ''}
          </div>
        </div>
        ${isAdmin && !isSelf && role !== 'admin' ? `
          <button class="member-remove-btn" data-user-id="${userId}" title="Удалить из беседы">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
  container.querySelectorAll('.member-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.member-remove-btn')) return;
      const userId = parseInt(item.dataset.userId);
      showUserProfile(userId);
    });
  });
  if (isAdmin) {
    container.querySelectorAll('.member-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = parseInt(btn.dataset.userId);
        const username = btn.closest('.member-item').dataset.username;
        confirmRemoveMember(conversationId, userId, username);
      });
    });
  }
}
function filterMembers(query, container) {
  const items = container.querySelectorAll('.member-item');
  items.forEach(item => {
    const username = item.dataset.username.toLowerCase();
    if (username.includes(query)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}
function confirmRemoveMember(conversationId, userId, username) {
  const confirmModal = document.createElement('div');
  confirmModal.className = 'modal-overlay';
  confirmModal.innerHTML = `
    <div class="modal-container confirm-modal">
      <div class="modal-header">
        <h2 class="modal-title">Удалить участника?</h2>
      </div>
      <div class="modal-body">
        <p>Вы уверены, что хотите удалить <strong>${username}</strong> из беседы?</p>
        <p class="warning-text">Это действие нельзя отменить.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancelRemoveBtn">Отмена</button>
        <button class="btn-danger" id="confirmRemoveBtn">Удалить</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmModal);
  const cancelBtn = confirmModal.querySelector('#cancelRemoveBtn');
  const confirmBtn = confirmModal.querySelector('#confirmRemoveBtn');
  cancelBtn.addEventListener('click', () => confirmModal.remove());
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) confirmModal.remove();
  });
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="spinner"></div> Удаление...';
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/conversations/${conversationId}/members/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to remove member');
      showToast(`${username} удален из беседы`, 'success');
      confirmModal.remove();
      const membersList = document.querySelector('#membersList');
      if (membersList) {
        loadMembers(conversationId, membersList);
      }
      socket.socket.emit('conversation:member-removed', {
        conversationId,
        userId,
        username
      });
    } catch (error) {
      console.error('[Members] Remove error:', error);
      showToast('Не удалось удалить участника', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Удалить';
    }
  });
}
function showAddMemberModal(conversationId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container add-member-modal">
      <div class="modal-header">
        <h2 class="modal-title">Добавить участника</h2>
        <button class="modal-close-btn" id="closeAddModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="members-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input 
            type="text" 
            id="userSearchInput" 
            placeholder="Поиск пользователей..." 
            autocomplete="off"
          />
        </div>
        <div class="users-list" id="usersList">
          <div class="empty-state">Начните вводить имя пользователя</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancelAddBtn">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const closeBtn = modal.querySelector('#closeAddModal');
  const cancelBtn = modal.querySelector('#cancelAddBtn');
  const searchInput = modal.querySelector('#userSearchInput');
  const usersList = modal.querySelector('#usersList');
  const closeModal = () => modal.remove();
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      usersList.innerHTML = '<div class="empty-state">Введите минимум 2 символа</div>';
      return;
    }
    usersList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Поиск...</div>';
    searchTimeout = setTimeout(async () => {
      await searchUsers(query, conversationId, usersList);
    }, 300);
  });
  searchInput.focus();
}
async function searchUsers(query, conversationId, container) {
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Search failed');
    const users = await response.json();
    const membersResponse = await fetch(`/api/conversations/${conversationId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const members = await response.json();
    const memberIds = new Set(members.map(m => m.id || m.user_id));
    const availableUsers = users.filter(u => !memberIds.has(u.id));
    if (availableUsers.length === 0) {
      container.innerHTML = '<div class="empty-state">Пользователи не найдены</div>';
      return;
    }
    container.innerHTML = availableUsers.map(user => {
      const color = getUserColor(user.id);
      const initials = getUserInitials(user.username);
      const isOnline = state.onlineUsers.has(user.id);
      return `
        <div class="user-item" data-user-id="${user.id}">
          <div class="member-avatar-wrapper">
            <div class="member-avatar" style="background: ${color}">
              ${user.avatar_url ? 
                `<img src="${user.avatar_url}" alt="${user.username}">` : 
                `<span>${initials}</span>`
              }
            </div>
            ${isOnline ? '<div class="online-badge"></div>' : ''}
          </div>
          <div class="member-info">
            <div class="member-name">${user.username}</div>
            <div class="member-status">${isOnline ? 'В сети' : 'Не в сети'}</div>
          </div>
          <button class="btn-primary add-user-btn" data-user-id="${user.id}">
            Добавить
          </button>
        </div>
      `;
    }).join('');
    container.querySelectorAll('.add-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = parseInt(btn.dataset.userId);
        await addMemberToConversation(conversationId, userId, btn);
      });
    });
  } catch (error) {
    console.error('[Members] Search error:', error);
    container.innerHTML = '<div class="error-message">Ошибка поиска</div>';
  }
}
async function addMemberToConversation(conversationId, userId, button) {
  button.disabled = true;
  button.innerHTML = '<div class="spinner"></div>';
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/conversations/${conversationId}/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to add member');
    const result = await response.json();
    showToast('Участник добавлен!', 'success');
    document.querySelector('.add-member-modal')?.closest('.modal-overlay').remove();
    const membersList = document.querySelector('#membersList');
    if (membersList) {
      loadMembers(conversationId, membersList);
    }
    socket.socket.emit('conversation:member-added', {
      conversationId,
      userId,
      username: result.username
    });
  } catch (error) {
    console.error('[Members] Add error:', error);
    showToast('Не удалось добавить участника', 'error');
    button.disabled = false;
    button.textContent = 'Добавить';
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
  }, 3000);
}
export { loadMembers, renderMembers };
