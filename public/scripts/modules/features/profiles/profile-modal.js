import profileManager from './profile-manager.js';
import { formatLastSeen, getUserColor, getUserInitials } from '../../utils.js';
import { initShuffleText } from '../../../effects/shuffle-text.js';
export async function showProfileModal(userId) {
  console.log('[ProfileModal] Opening for user:', userId);
  try {
    const profile = await profileManager.loadProfile(userId);
    if (!profile) {
      console.error('[ProfileModal] Failed to load profile');
      return;
    }
    const modal = createProfileModal(profile);
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
    const shuffleText = initShuffleText({ duration: 0.8, iterations: 12 });
    setTimeout(() => {
      shuffleText.shuffle(modal.querySelector('.profile-modal__name'));
    }, 100);
  } catch (error) {
    console.error('[ProfileModal] Error:', error);
  }
}
function createProfileModal(profile) {
  const modal = document.createElement('div');
  modal.className = 'profile-modal';
  modal.id = 'profileModal';
  const userColor = getUserColor(profile.user_id);
  const userInitials = getUserInitials(profile.username);
  modal.innerHTML = `
    <div class="profile-modal__overlay"></div>
    <div class="profile-modal__content">
      <div class="profile-modal__header">
        <button class="profile-modal__close" id="closeProfileModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="profile-modal__body">
        <!-- Avatar -->
        <div class="profile-modal__avatar-container">
          ${profile.avatar_url 
            ? `<img src="${profile.avatar_url}" alt="${profile.username}" class="profile-modal__avatar">` 
            : `<div class="profile-modal__avatar-fallback" style="background: ${userColor}">
                 ${userInitials}
               </div>`
          }
        </div>
        <!-- Name -->
        <h2 class="profile-modal__name">${escapeHtml(profile.username)}</h2>
        <!-- Status -->
        ${profile.status 
          ? `<div class="profile-modal__status">${escapeHtml(profile.status)}</div>` 
          : ''
        }
        <!-- Mood -->
        ${profile.mood 
          ? `<div class="profile-modal__mood">${escapeHtml(profile.mood)}</div>` 
          : ''
        }
        <!-- Bio -->
        ${profile.bio 
          ? `<div class="profile-modal__section">
               <h3>О себе</h3>
               <p>${escapeHtml(profile.bio)}</p>
             </div>` 
          : ''
        }
        <!-- Gallery -->
        ${profile.gallery && profile.gallery.length > 0 
          ? `<div class="profile-modal__section">
               <h3>Фотографии</h3>
               <div class="profile-modal__gallery">
                 ${profile.gallery.map(img => `
                   <img src="${img.image_path}" alt="${img.caption || ''}" 
                        class="profile-modal__gallery-item"
                        data-caption="${escapeHtml(img.caption || '')}">
                 `).join('')}
               </div>
             </div>` 
          : ''
        }
        <!-- Actions -->
        <div class="profile-modal__actions">
          <button class="btn-primary" id="sendMessageBtn">
            Написать сообщение
          </button>
          <button class="btn-secondary" id="blockUserBtn">
            Заблокировать
          </button>
        </div>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector('#closeProfileModal');
  const overlay = modal.querySelector('.profile-modal__overlay');
  closeBtn.addEventListener('click', () => closeProfileModal(modal));
  overlay.addEventListener('click', () => closeProfileModal(modal));
  const sendMessageBtn = modal.querySelector('#sendMessageBtn');
  sendMessageBtn.addEventListener('click', () => {
    closeProfileModal(modal);
  });
  const blockUserBtn = modal.querySelector('#blockUserBtn');
  blockUserBtn.addEventListener('click', () => {
    handleBlockUser(profile.user_id);
  });
  return modal;
}
function closeProfileModal(modal) {
  modal.classList.remove('visible');
  setTimeout(() => {
    modal.remove();
  }, 300);
}
async function handleBlockUser(userId) {
  if (!confirm('Заблокировать этого пользователя?')) {
    return;
  }
  try {
    const response = await fetch('/api/users/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    alert('Пользователь заблокирован');
    const modal = document.getElementById('profileModal');
    if (modal) {
      closeProfileModal(modal);
    }
  } catch (error) {
    console.error('[ProfileModal] Block failed:', error);
    alert('Ошибка при блокировке пользователя');
  }
}
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
