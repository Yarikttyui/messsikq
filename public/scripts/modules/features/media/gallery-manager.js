import state from '../../state.js';
const MAX_PHOTOS = 12;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export async function showGalleryManager(userId) {
  console.log('[GalleryManager] Opening gallery for user:', userId);
  const currentUser = state.getUser();
  const isOwnGallery = currentUser && currentUser.id === userId;
  try {
    const photos = await loadUserGallery(userId);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay gallery-manager-modal';
    modal.id = 'galleryManagerModal';
    modal.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            Галерея
          </h2>
          <button class="modal-close" id="closeGalleryBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          ${isOwnGallery ? `
            <div class="gallery-upload-section">
              <button class="btn-primary" id="uploadPhotoBtn" ${photos.length >= MAX_PHOTOS ? 'disabled' : ''}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Загрузить фото (${photos.length}/${MAX_PHOTOS})
              </button>
              <input type="file" id="galleryFileInput" accept="image/*" multiple hidden />
            </div>
          ` : ''}
          <div class="gallery-grid"></div>
        </div>
      </div>
    `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  await loadUserGallery(userId);
  setupGalleryEventListeners(modal);
}
catch (error) {
    console.error('[GalleryManager] Error:', error);
  }
}
function closeGalleryManager() {
  const modal = document.getElementById('galleryManagerModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 300);
}
async function loadUserGallery(userId) {
  const response = await fetch(`/api/users/${userId}/gallery`, {
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('token')}`
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.photos || [];
}
function renderGalleryPhotos(photos, isOwnGallery) {
  if (photos.length === 0) {
    return '';
  }
  return photos.map(photo => `
    <div class="gallery-photo-item" data-photo-id="${photo.id}">
      <img src="${photo.url}" alt="${escapeHtml(photo.caption || '')}" loading="lazy">
      <div class="gallery-photo-overlay">
        <button class="gallery-photo-action" onclick="window.viewGalleryPhoto(${photo.id})">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </button>
        ${isOwnGallery ? `
          <button class="gallery-photo-action" onclick="window.deleteGalleryPhoto(${photo.id})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        ` : ''}
      </div>
      ${photo.caption ? `
        <div class="gallery-photo-caption">${escapeHtml(photo.caption)}</div>
      ` : ''}
    </div>
  `).join('');
}
async function handleFileUpload(files) {
  if (!files || files.length === 0) return;
  const currentUser = state.getUser();
  if (!currentUser) return;
  const existingPhotos = await loadUserGallery(currentUser.id);
  const remainingSlots = MAX_PHOTOS - existingPhotos.length;
  if (remainingSlots <= 0) {
    alert(`Достигнут лимит фотографий (${MAX_PHOTOS})`);
    return;
  }
  const filesToUpload = Array.from(files).slice(0, remainingSlots);
  for (const file of filesToUpload) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert(`Файл ${file.name} имеет неподдерживаемый формат`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`Файл ${file.name} слишком большой (макс. 5MB)`);
      continue;
    }
    try {
      await uploadPhoto(file);
    } catch (error) {
      console.error('[GalleryManager] Failed to upload:', file.name, error);
      alert(`Не удалось загрузить ${file.name}`);
    }
  }
  const updatedPhotos = await loadUserGallery(currentUser.id);
  updateGalleryGrid(updatedPhotos, true);
}
async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const response = await fetch('/api/users/gallery', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('token')}`
    },
    body: formData
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
function updateGalleryGrid(photos, isOwnGallery) {
  const grid = document.getElementById('galleryGrid');
  const uploadBtn = document.getElementById('uploadPhotoBtn');
  if (!grid) return;
  grid.innerHTML = renderGalleryPhotos(photos, isOwnGallery);
  if (uploadBtn) {
    uploadBtn.disabled = photos.length >= MAX_PHOTOS;
    uploadBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      Загрузить фото (${photos.length}/${MAX_PHOTOS})
    `;
  }
}
window.viewGalleryPhoto = function(photoId) {
  console.log('[GalleryManager] View photo:', photoId);
  const photoItem = document.querySelector(`[data-photo-id="${photoId}"]`);
  if (!photoItem) return;
  const img = photoItem.querySelector('img');
  if (!img) return;
  const lightbox = document.createElement('div');
  lightbox.className = 'gallery-lightbox';
  lightbox.innerHTML = `
    <div class="lightbox-overlay"></div>
    <div class="lightbox-content">
      <img src="${img.src}" alt="${img.alt}">
      <button class="lightbox-close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(lightbox);
  requestAnimationFrame(() => {
    lightbox.classList.add('show');
  });
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const overlay = lightbox.querySelector('.lightbox-overlay');
  closeBtn.addEventListener('click', () => closeLightbox(lightbox));
  overlay.addEventListener('click', () => closeLightbox(lightbox));
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeLightbox(lightbox);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
};
window.deleteGalleryPhoto = async function(photoId) {
  if (!confirm('Удалить это фото?')) {
    return;
  }
  try {
    console.log('[GalleryManager] Deleting photo:', photoId);
    const response = await fetch(`/api/users/gallery/${photoId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const photoItem = document.querySelector(`[data-photo-id="${photoId}"]`);
    if (photoItem) {
      photoItem.style.opacity = '0';
      photoItem.style.transform = 'scale(0.8)';
      setTimeout(() => photoItem.remove(), 300);
    }
    const currentUser = state.getUser();
    if (currentUser) {
      const updatedPhotos = await loadUserGallery(currentUser.id);
      const uploadBtn = document.getElementById('uploadPhotoBtn');
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Загрузить фото (${updatedPhotos.length}/${MAX_PHOTOS})
        `;
      }
    }
  } catch (error) {
    console.error('[GalleryManager] Failed to delete photo:', error);
    alert('Не удалось удалить фото');
  }
};
function closeLightbox(lightbox) {
  lightbox.classList.remove('show');
  setTimeout(() => lightbox.remove(), 300);
}
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
