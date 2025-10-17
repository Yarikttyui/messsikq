class StandaloneAdminPanel {
  constructor() {
    this.currentSection = 'dashboard';
    this.users = [];
    this.conversations = [];
    this.logs = [];
    this.stats = {};
    this.currentPage = 1;
    this.itemsPerPage = 20;
    this.filterStatus = 'all';
    this.currentUser = null;
    this.authToken = null;
  }

  async init() {
    console.log('[Admin] Standalone mode initializing...');
    this.showLoginForm();
  }

  showLoginForm() {
    const mainContent = document.querySelector('.admin-main');
    mainContent.innerHTML = `
      <div style="max-width: 400px; margin: 100px auto; padding: 30px; background: var(--surface); border-radius: 12px;">
        <h2 style="margin-bottom: 20px; color: var(--text-primary);">Вход в админ-панель</h2>
        <form id="admin-login-form">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; color: var(--text-secondary);">Логин</label>
            <input type="text" name="username" required 
              style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--text-primary);">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; color: var(--text-secondary);">Пароль</label>
            <input type="password" name="password" required 
              style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--text-primary);">
          </div>
          <button type="submit" 
            style="width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
            Войти
          </button>
          <div id="login-error" style="margin-top: 15px; color: #ff4444; display: none;"></div>
        </form>
      </div>
    `;

    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      await this.handleLogin(formData.get('username'), formData.get('password'));
    });
  }

  async handleLogin(username, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error('Неверный логин или пароль');
      }

      const data = await response.json();
      this.authToken = data.token;
      localStorage.setItem('adminAuthToken', data.token);

      const isAdmin = await this.checkAdminAccess();
      if (!isAdmin) {
        document.getElementById('login-error').textContent = 'У вас нет прав администратора';
        document.getElementById('login-error').style.display = 'block';
        return;
      }
      await this.loadAdminPanel();
    } catch (error) {
      console.error('[Admin] Login error:', error);
      document.getElementById('login-error').textContent = error.message;
      document.getElementById('login-error').style.display = 'block';
    }
  }

  async checkAdminAccess() {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async loadAdminPanel() {
    this.setupNavigation();
    this.setupSearch();
    await this.loadStats();
    await this.loadUsers();
    this.loadCurrentSection();
    this.updateAdminInfo();
  }

  setupNavigation() {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentSection = item.dataset.section;
        this.loadCurrentSection();
      });
    });
  }

  setupSearch() {
    const searchInput = document.querySelector('.admin-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
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
    }
  }

  async loadStats() {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      this.stats = await response.json();
    } catch (error) {
      console.error('[Admin] Load stats error:', error);
    }
  }

  async loadUsers() {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      this.users = Array.isArray(data) ? data : [];
      console.log('[Admin] Loaded users:', this.users.length);
    } catch (error) {
      console.error('[Admin] Load users error:', error);
      this.users = [];
    }
  }

  async loadConversations() {
    try {
      const response = await fetch('/api/admin/conversations', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      this.conversations = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('[Admin] Load conversations error:', error);
      this.conversations = [];
    }
  }

  async loadLogs() {
    try {
      const response = await fetch('/api/admin/logs', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      this.logs = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('[Admin] Load logs error:', error);
      this.logs = [];
    }
  }

  renderDashboard() {
    const content = document.querySelector('.admin-main');
    content.innerHTML = `
      <div class="admin-header">
        <h1>Панель управления</h1>
      </div>
      
      <div class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="stat-label">Всего пользователей</div>
          <div class="stat-value">${this.stats.totalUsers || 0}</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-label">Онлайн</div>
          <div class="stat-value">${this.stats.onlineUsers || 0}</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-label">Бесед</div>
          <div class="stat-value">${this.stats.totalConversations || 0}</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-label">Сообщений</div>
          <div class="stat-value">${this.stats.totalMessages || 0}</div>
        </div>
      </div>

      <div class="admin-section">
        <h2>Последние пользователи</h2>
        <div class="admin-table-container">
          ${this.renderUsersTable(this.users.slice(0, 10))}
        </div>
      </div>
    `;
  }

  renderUsers() {
    const content = document.querySelector('.admin-main');
    content.innerHTML = `
      <div class="admin-header">
        <h1>Управление пользователями</h1>
        <div class="admin-filters">
          <select class="admin-filter-select" id="status-filter">
            <option value="all">Все пользователи</option>
            <option value="online">Онлайн</option>
            <option value="blocked">Заблокированные</option>
            <option value="admins">Администраторы</option>
          </select>
        </div>
      </div>

      <div class="admin-table-container">
        ${this.renderUsersTable(this.users)}
      </div>
    `;

    document.getElementById('status-filter').addEventListener('change', (e) => {
      this.filterStatus = e.target.value;
      this.renderUsers();
    });
  }

  renderUsersTable(users) {
    let filteredUsers = users;
    
    if (this.filterStatus === 'blocked') {
      filteredUsers = users.filter(u => u.is_blocked);
    } else if (this.filterStatus === 'admins') {
      filteredUsers = users.filter(u => u.is_admin);
    } else if (this.filterStatus === 'online') {
      filteredUsers = users.filter(u => u.is_online);
    }

    return `
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Пользователь</th>
            <th>Отображаемое имя</th>
            <th>Статус</th>
            <th>Роль</th>
            <th>Регистрация</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${filteredUsers.map(user => `
            <tr>
              <td>${user.id}</td>
              <td>
                <div class="user-cell">
                  <div class="user-avatar">${user.username[0].toUpperCase()}</div>
                  <span>${user.username}</span>
                </div>
              </td>
              <td>${user.displayName || '-'}</td>
              <td>
                <span class="status-badge ${user.is_online ? 'status-online' : 'status-offline'}">
                  ${user.is_online ? 'Онлайн' : 'Оффлайн'}
                </span>
              </td>
              <td>
                ${user.is_admin ? '<span class="role-badge role-admin">Админ</span>' : '<span class="role-badge">Пользователь</span>'}
              </td>
              <td>${new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
              <td>
                <button class="admin-btn-small" onclick="adminPanel.toggleBlock(${user.id}, ${user.is_blocked})">
                  ${user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async toggleBlock(userId, isBlocked) {
    try {
      const endpoint = isBlocked ? '/api/admin/users/unblock' : '/api/admin/users/block';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await this.loadUsers();
        this.renderUsers();
      }
    } catch (error) {
      console.error('[Admin] Toggle block error:', error);
      alert('Ошибка при изменении статуса пользователя');
    }
  }

  renderConversations() {
    const content = document.querySelector('.admin-main');
    content.innerHTML = `
      <div class="admin-header">
        <h1>Управление беседами</h1>
      </div>
      <div class="admin-section">
        <p>Загрузка бесед...</p>
      </div>
    `;
    this.loadConversations().then(() => {
      content.innerHTML = `
        <div class="admin-header">
          <h1>Управление беседами</h1>
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Участников</th>
                <th>Сообщений</th>
                <th>Создана</th>
              </tr>
            </thead>
            <tbody>
              ${this.conversations.map(conv => `
                <tr>
                  <td>${conv.id}</td>
                  <td>${conv.name || 'Без названия'}</td>
                  <td>${conv.participant_count || 0}</td>
                  <td>${conv.message_count || 0}</td>
                  <td>${new Date(conv.created_at).toLocaleDateString('ru-RU')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  renderLogs() {
    const content = document.querySelector('.admin-main');
    content.innerHTML = `
      <div class="admin-header">
        <h1>Логи действий</h1>
      </div>
      <div class="admin-section">
        <p>Загрузка логов...</p>
      </div>
    `;
    this.loadLogs().then(() => {
      content.innerHTML = `
        <div class="admin-header">
          <h1>Логи действий</h1>
        </div>
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Администратор</th>
                <th>Действие</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              ${this.logs.map(log => `
                <tr>
                  <td>${new Date(log.created_at).toLocaleString('ru-RU')}</td>
                  <td>${log.admin_username}</td>
                  <td>${log.action}</td>
                  <td>${log.details || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  updateAdminInfo() {
    const adminInfo = document.querySelector('.admin-user-info');
    if (adminInfo) {
      adminInfo.innerHTML = `
        <div class="admin-avatar">A</div>
        <div class="admin-user-details">
          <div class="admin-user-name">Администратор</div>
          <div class="admin-user-role">Модератор</div>
        </div>
      `;
    }
  }

  handleSearch(query) {
    console.log('[Admin] Search:', query);
  }
}

const adminPanel = new StandaloneAdminPanel();
window.adminPanel = adminPanel;

document.addEventListener('DOMContentLoaded', () => {
  adminPanel.init();
});
