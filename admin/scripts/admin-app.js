import socketManager from '/scripts/modules/socket.js';
import state from '/scripts/modules/state.js';

class AdminPanel {
  constructor() {
    this.currentSection = 'dashboard';
    this.users = [];
    this.conversations = [];
    this.logs = [];
    this.stats = {};
    this.currentPage = 1;
    this.itemsPerPage = 20;
    this.filterStatus = 'all';
  }

  async init() {
    console.log('[Admin] Initializing...');
    
    await this.waitForAuth();
    
    const user = state.getCurrentUser();
    if (!user) {
      alert('Необходима авторизация');
      window.location.href = '/auth.html';
      return;
    }

    const isAdmin = await this.checkAdminAccess();
    if (!isAdmin) {
      alert('У вас нет прав доступа к панели модерации');
      window.location.href = '/';
      return;
    }

    this.setupNavigation();
    this.setupSearch();
    this.loadCurrentSection();
    this.setupSocketListeners();

    await this.loadStats();
    await this.loadUsers();

    this.updateAdminInfo(user);
  }

  async waitForAuth() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 5;
      
      const checkAuth = () => {
        attempts++;
        const token = localStorage.getItem('authToken');
        const user = state.getCurrentUser();
        
        console.log(`[Admin] Auth check ${attempts}:`, { 
          hasToken: !!token, 
          hasUser: !!user,
          user: user ? user.username : null
        });
        
        if (user && token) {
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('[Admin] Auth timeout - no token found');
          resolve();
        } else {
          setTimeout(checkAuth, 100);
        }
      };
      checkAuth();
    });
  }

  async checkAdminAccess() {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return false;

      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      return response.ok;
    } catch (error) {
      console.error('[Admin] Check access error:', error);
      return false;
    }
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.admin-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentSection = item.dataset.section;
        this.loadCurrentSection();
      });
    });
  }

  setupSearch() {
    const searchInput = document.getElementById('adminSearch');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.handleSearch(e.target.value);
      }, 300);
    });
  }

  handleSearch(query) {
    if (this.currentSection === 'users') {
      this.filterUsers(query);
    } else if (this.currentSection === 'conversations') {
      this.filterConversations(query);
    }
  }

  loadCurrentSection() {
    switch (this.currentSection) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'users':
        this.renderUsers();
        break;
      case 'conversations':
        this.renderConversations();
        break;
      case 'logs':
        this.renderLogs();
        break;
      case 'settings':
        this.renderSettings();
        break;
    }
  }

  renderDashboard() {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h1 class="admin-section-title">Панель управления</h1>
      <p class="admin-section-subtitle">Обзор активности системы</p>

      <div class="admin-stats" id="statsContainer">
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="stat-value" id="totalUsers">0</div>
          <div class="stat-label">Всего пользователей</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="stat-value" id="onlineUsers">0</div>
          <div class="stat-label">Онлайн сейчас</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="stat-value" id="totalConversations">0</div>
          <div class="stat-label">Активных бесед</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon red">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div class="stat-value" id="blockedUsers">0</div>
          <div class="stat-label">Заблокированных</div>
        </div>
      </div>

      <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Последняя активность</h2>
      <div id="recentActivity"></div>
    `;

    this.updateStats();
  }

  renderUsers() {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h1 class="admin-section-title">Пользователи</h1>
      <p class="admin-section-subtitle">Управление учетными записями</p>

      <div class="admin-filters">
        <button class="filter-btn ${this.filterStatus === 'all' ? 'active' : ''}" data-filter="all">
          Все пользователи
        </button>
        <button class="filter-btn ${this.filterStatus === 'online' ? 'active' : ''}" data-filter="online">
          Онлайн
        </button>
        <button class="filter-btn ${this.filterStatus === 'blocked' ? 'active' : ''}" data-filter="blocked">
          Заблокированные
        </button>
        <button class="filter-btn ${this.filterStatus === 'new' ? 'active' : ''}" data-filter="new">
          Новые (7 дней)
        </button>
      </div>

      <div class="users-table">
        <div class="table-header">
          <div></div>
          <div>Пользователь</div>
          <div>Email</div>
          <div>Статус</div>
          <div>Регистрация</div>
          <div>Действия</div>
        </div>
        <div id="usersTableBody"></div>
      </div>

      <div class="pagination" id="usersPagination"></div>
    `;

    const filterButtons = content.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterStatus = btn.dataset.filter;
        this.renderUsers();
      });
    });

    this.renderUsersTable();
  }

  async renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;


    let filteredUsers = this.users;
    
    if (this.filterStatus === 'online') {
      filteredUsers = this.users.filter(u => u.isOnline);
    } else if (this.filterStatus === 'blocked') {
      filteredUsers = this.users.filter(u => u.isBlocked);
    } else if (this.filterStatus === 'new') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filteredUsers = this.users.filter(u => new Date(u.createdAt) > weekAgo);
    }

    const totalPages = Math.ceil(filteredUsers.length / this.itemsPerPage);
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);

    if (pageUsers.length === 0) {
      tbody.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div>Пользователи не найдены</div>
        </div>
      `;
      return;
    }

    tbody.innerHTML = pageUsers.map(user => this.renderUserRow(user)).join('');


    this.renderPagination(totalPages, 'usersPagination');
    this.setupUserActions();
  }

  renderUserRow(user) {
    const initials = user.username ? user.username.substring(0, 2).toUpperCase() : '?';
    const createdDate = new Date(user.createdAt).toLocaleDateString('ru-RU');
    
    let statusBadge = '';
    if (user.isBlocked) {
      statusBadge = '<span class="status-badge blocked"><span class="status-dot"></span> Заблокирован</span>';
    } else if (user.isOnline) {
      statusBadge = '<span class="status-badge online"><span class="status-dot"></span> Онлайн</span>';
    } else {
      statusBadge = '<span class="status-badge offline"><span class="status-dot"></span> Оффлайн</span>';
    }

    return `
      <div class="table-row" data-user-id="${user.id}">
        <div class="user-avatar-cell">${initials}</div>
        <div class="user-info">
          <div class="user-name">${this.escapeHtml(user.username || 'Unknown')}</div>
          <div class="user-email">ID: ${user.id}</div>
        </div>
        <div>${this.escapeHtml(user.email || 'N/A')}</div>
        <div>${statusBadge}</div>
        <div>${createdDate}</div>
        <div class="action-buttons">
          ${user.isBlocked 
            ? `<button class="action-btn primary" data-action="unblock" data-user-id="${user.id}">Разблокировать</button>`
            : `<button class="action-btn danger" data-action="block" data-user-id="${user.id}">Блокировать</button>`
          }
        </div>
      </div>
    `;
  }

  renderConversations() {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h1 class="admin-section-title">Беседы</h1>
      <p class="admin-section-subtitle">Управление чатами и группами</p>

      <div class="users-table">
        <div class="table-header" style="grid-template-columns: 1fr 200px 150px 150px 120px;">
          <div>Название беседы</div>
          <div>Участников</div>
          <div>Сообщений</div>
          <div>Создана</div>
          <div>Действия</div>
        </div>
        <div id="conversationsTableBody"></div>
      </div>
    `;

    this.renderConversationsTable();
  }

  renderConversationsTable() {
    const tbody = document.getElementById('conversationsTableBody');
    if (!tbody) return;

    if (this.conversations.length === 0) {
      tbody.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <div>Беседы не найдены</div>
        </div>
      `;
      return;
    }

    tbody.innerHTML = this.conversations.map(conv => `
      <div class="table-row" style="grid-template-columns: 1fr 200px 150px 150px 120px;">
        <div class="user-info">
          <div class="user-name">${this.escapeHtml(conv.name || 'Без названия')}</div>
          <div class="user-email">ID: ${conv.id}</div>
        </div>
        <div>${conv.memberCount || 0}</div>
        <div>${conv.messageCount || 0}</div>
        <div>${new Date(conv.createdAt).toLocaleDateString('ru-RU')}</div>
        <div class="action-buttons">
          <button class="action-btn primary" data-action="view-conversation" data-conv-id="${conv.id}">Открыть</button>
        </div>
      </div>
    `).join('');
  }

  renderLogs() {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h1 class="admin-section-title">Логи действий</h1>
      <p class="admin-section-subtitle">История действий модераторов</p>

      <div class="users-table">
        <div class="table-header" style="grid-template-columns: 200px 150px 1fr 150px;">
          <div>Модератор</div>
          <div>Действие</div>
          <div>Описание</div>
          <div>Время</div>
        </div>
        <div id="logsTableBody"></div>
      </div>
    `;

    this.renderLogsTable();
  }

  renderLogsTable() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    if (this.logs.length === 0) {
      tbody.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div>Логов пока нет</div>
        </div>
      `;
      return;
    }

    tbody.innerHTML = this.logs.map(log => `
      <div class="table-row" style="grid-template-columns: 200px 150px 1fr 150px;">
        <div>${this.escapeHtml(log.moderatorName)}</div>
        <div><span class="status-badge ${log.action === 'block' ? 'blocked' : 'online'}">${log.actionLabel}</span></div>
        <div>${this.escapeHtml(log.description)}</div>
        <div>${new Date(log.timestamp).toLocaleString('ru-RU')}</div>
      </div>
    `).join('');
  }

  renderSettings() {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
      <h1 class="admin-section-title">Настройки</h1>
      <p class="admin-section-subtitle">Конфигурация панели модерации</p>

      <div class="stat-card" style="max-width: 600px;">
        <h3 style="margin-bottom: 16px; font-size: 18px; font-weight: 600;">Системная информация</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Версия сервера:</span>
            <span style="font-weight: 600;">1.0.0</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Uptime:</span>
            <span style="font-weight: 600;" id="uptime">-</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">База данных:</span>
            <span style="font-weight: 600;">PostgreSQL</span>
          </div>
        </div>
      </div>
    `;
  }

  renderPagination(totalPages, containerId) {
    const container = document.getElementById(containerId);
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    let html = '';
    
    if (this.currentPage > 1) {
      html += `<button class="page-btn" data-page="${this.currentPage - 1}">←</button>`;
    }

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
        html += `<button class="page-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
        html += `<span class="page-btn" style="cursor: default; border: none;">...</span>`;
      }
    }

    if (this.currentPage < totalPages) {
      html += `<button class="page-btn" data-page="${this.currentPage + 1}">→</button>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentPage = parseInt(btn.dataset.page);
        this.renderUsersTable();
      });
    });
  }

  setupUserActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = btn.dataset.action;
        const userId = btn.dataset.userId;

        if (action === 'block') {
          await this.blockUser(userId);
        } else if (action === 'unblock') {
          await this.unblockUser(userId);
        }
      });
    });
  }

  async blockUser(userId) {
    if (!confirm('Вы уверены, что хотите заблокировать этого пользователя?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/users/block', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        alert('Пользователь заблокирован');
        await this.loadUsers();
        this.renderUsersTable();
        this.addLog('block', `Заблокирован пользователь ID: ${userId}`);
      }
    } catch (error) {
      console.error('[Admin] Block user error:', error);
      alert('Ошибка при блокировке пользователя');
    }
  }

  async unblockUser(userId) {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/users/unblock', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        alert('Пользователь разблокирован');
        await this.loadUsers();
        this.renderUsersTable();
        this.addLog('unblock', `Разблокирован пользователь ID: ${userId}`);
      }
    } catch (error) {
      console.error('[Admin] Unblock user error:', error);
      alert('Ошибка при разблокировке пользователя');
    }
  }

  async loadStats() {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        this.stats = await response.json();
        this.updateStats();
      }
    } catch (error) {
      console.error('[Admin] Load stats error:', error);
    }
  }

  async loadUsers() {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        this.users = await response.json();
        console.log('[Admin] Loaded users:', this.users.length);
      }
    } catch (error) {
      console.error('[Admin] Load users error:', error);
    }
  }

  async loadConversations() {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/admin/conversations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        this.conversations = await response.json();
      }
    } catch (error) {
      console.error('[Admin] Load conversations error:', error);
    }
  }

  updateStats() {
    const totalUsersEl = document.getElementById('totalUsers');
    const onlineUsersEl = document.getElementById('onlineUsers');
    const totalConversationsEl = document.getElementById('totalConversations');
    const blockedUsersEl = document.getElementById('blockedUsers');

    if (totalUsersEl) totalUsersEl.textContent = this.stats.totalUsers || this.users.length;
    if (onlineUsersEl) onlineUsersEl.textContent = this.stats.onlineUsers || this.users.filter(u => u.isOnline).length;
    if (totalConversationsEl) totalConversationsEl.textContent = this.stats.totalConversations || 0;
    if (blockedUsersEl) blockedUsersEl.textContent = this.stats.blockedUsers || this.users.filter(u => u.isBlocked).length;
  }

  updateAdminInfo(user) {
    const adminAvatar = document.getElementById('adminAvatar');
    const adminUsername = document.getElementById('adminUsername');

    if (adminAvatar) {
      adminAvatar.textContent = user.username ? user.username.substring(0, 2).toUpperCase() : 'A';
    }
    if (adminUsername) {
      adminUsername.textContent = user.username || 'Admin';
    }
  }

  setupSocketListeners() {
    socketManager.socket.on('user:status', ({ userId, isOnline }) => {
      const user = this.users.find(u => u.id === userId);
      if (user) {
        user.isOnline = isOnline;
        if (this.currentSection === 'users') {
          this.renderUsersTable();
        }
      }
    });
  }

  filterUsers(query) {
    console.log('[Admin] Filter users:', query);
  }

  filterConversations(query) {
    console.log('[Admin] Filter conversations:', query);
  }

  addLog(action, description) {
    const user = state.getCurrentUser();
    this.logs.unshift({
      moderatorName: user.username,
      action: action,
      actionLabel: action === 'block' ? 'Блокировка' : 'Разблокировка',
      description: description,
      timestamp: Date.now()
    });
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const adminPanel = new AdminPanel();

document.addEventListener('DOMContentLoaded', () => {
  adminPanel.init();
});

window.logout = () => {
  if (confirm('Выйти из панели модерации?')) {
    window.location.href = '/auth.html';
  }
};

export default adminPanel;
