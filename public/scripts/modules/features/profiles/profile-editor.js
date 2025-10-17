import profileManager from './profile-manager.js';
import state from '../../state.js';
export async function showProfileEditor() {
  console.log('[ProfileEditor] Opening editor');
  const existingModal = document.getElementById('profileEditorModal');
  if (existingModal) {
    console.log('[ProfileEditor] Editor already open, focusing existing modal');
    existingModal.classList.add('shake');
    setTimeout(() => existingModal.classList.remove('shake'), 300);
    return;
  }
  try {
    const currentUser = state.getUser();
    if (!currentUser) {
      console.error('[ProfileEditor] No current user');
      return;
    }
    const profile = await profileManager.loadProfile(currentUser.id);
    const modal = createEditorModal(profile || {});
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  } catch (error) {
    console.error('[ProfileEditor] Error:', error);
  }
}
function createEditorModal(profile) {
  const modal = document.createElement('div');
  modal.className = 'profile-editor-modal';
  modal.id = 'profileEditorModal';
  modal.innerHTML = `
    <div class="profile-editor-modal__overlay"></div>
    <div class="profile-editor-modal__content">
      <div class="profile-editor-modal__header">
        <h2>Редактировать профиль</h2>
        <button class="profile-editor-modal__close" id="closeEditorModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="profile-editor-modal__body">
        <form id="profileEditorForm">
          <!-- Avatar Upload -->
          <div class="form-group">
            <label>Аватар</label>
            <div class="avatar-upload-section">
              <div class="current-avatar" id="currentAvatar">
                ${profile.avatar_url ? `
                  <img src="/uploads/${profile.avatar_url}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                ` : `
                  <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue)); border-radius: 50%; color: white; font-size: 32px; font-weight: 600;">
                    ${profile.username ? profile.username.charAt(0).toUpperCase() : '?'}
                  </div>
                `}
              </div>
              <div class="avatar-upload-buttons">
                <button type="button" class="btn-secondary" id="changeAvatarBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  Изменить фото
                </button>
                <input type="file" id="avatarInput" accept="image/*" style="display: none;" />
                <button type="button" class="btn-danger" id="deleteAvatarBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Удалить
                </button>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label for="displayName">Отображаемое имя</label>
            <input type="text" id="displayName" class="form-input" value="${profile.display_name || ''}" maxlength="50" />
          </div>
          <div class="form-group">
            <label for="bio">О себе</label>
            <textarea id="bio" class="form-input" rows="3" maxlength="200">${profile.bio || ''}</textarea>
          </div>
          <div class="form-group">
            <label for="status">Статус</label>
            <input type="text" id="status" class="form-input" value="${profile.status || ''}" maxlength="100" placeholder="Чем вы сейчас занимаетесь?" />
          </div>
        </form>
      </div>
      <div class="profile-editor-modal__footer">
        <button type="button" class="btn-secondary" id="cancelEditorBtn">Отмена</button>
        <button type="submit" class="btn-primary" id="saveEditorBtn">Сохранить</button>
      </div>
    </div>
  `;
  setupModalEventListeners(modal);
  return modal;
}
function setupModalEventListeners(modal) {
  const closeBtn = modal.querySelector('#closeEditorModal');
  const cancelBtn = modal.querySelector('#cancelEditorBtn');
  const saveBtn = modal.querySelector('#saveEditorBtn');
  const avatarInput = modal.querySelector('#avatarInput');
  const changeAvatarBtn = modal.querySelector('#changeAvatarBtn');
  const deleteAvatarBtn = modal.querySelector('#deleteAvatarBtn');
  const overlay = modal.querySelector('.profile-editor-modal__overlay');
  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);
  changeAvatarBtn?.addEventListener('click', () => avatarInput?.click());
  avatarInput?.addEventListener('change', (e) => handleAvatarUpload(e, modal));
  deleteAvatarBtn?.addEventListener('click', () => handleAvatarDelete(modal));
  saveBtn?.addEventListener('click', () => handleSaveProfile(modal));
}
async function handleAvatarUpload(e, modal) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Пожалуйста, выберите изображение', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Размер файла не должен превышать 5 МБ', 'error');
    return;
  }
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    const currentUser = state.getUser();
    const response = await fetch(`/api/users/${currentUser.id}/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: formData
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    const currentAvatar = modal.querySelector('#currentAvatar');
    if (currentAvatar && data.user && data.user.avatarUrl) {
      currentAvatar.innerHTML = `<img src="${data.user.avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
    }
    if (data.user) {
      state.updateUser({ 
        avatarUrl: data.user.avatarUrl
      });
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar && data.user.avatarUrl) {
        const img = userAvatar.querySelector('img');
        if (img) {
          img.src = data.user.avatarUrl;
        }
      }
    }
    showToast('Аватар успешно обновлён', 'success');
  } catch (error) {
    console.error('[ProfileEditor] Failed to upload avatar:', error);
    showToast('Ошибка при загрузке аватара', 'error');
  }
}
async function handleFormSubmit(e, modal) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const updates = {
    status: formData.get('status'),
    mood: formData.get('mood'),
    bio: formData.get('bio'),
    privacy_status: formData.get('privacy_status'),
    privacy_photos: formData.get('privacy_photos'),
    privacy_last_seen: formData.get('privacy_last_seen'),
    theme: formData.get('theme')
  };
  const saveBtn = modal.querySelector('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Сохранение...';
  try {
    await profileManager.updateProfile(updates);
    console.log('[ProfileEditor] Profile updated successfully');
    if (updates.theme) {
      applyTheme(updates.theme);
    }
    showToast('Профиль успешно обновлён', 'success');
    closeEditorModal(modal);
  } catch (error) {
    console.error('[ProfileEditor] Failed to update profile:', error);
    showToast('Ошибка при обновлении профиля', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Сохранить';
  }
}
function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
  if (theme === 'dark') {
    html.classList.add('theme-dark');
    html.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    html.classList.add('theme-light');
    html.setAttribute('data-theme', 'light');
  } else if (theme === 'auto') {
    html.classList.add('theme-auto');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
  }
  console.log('[ProfileEditor] Theme applied:', theme);
}
function closeEditorModal(modal) {
  modal.classList.remove('visible');
  setTimeout(() => {
    modal.remove();
  }, 300);
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
