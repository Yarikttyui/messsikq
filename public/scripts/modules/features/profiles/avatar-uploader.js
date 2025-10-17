import state from '../../state.js';
export async function showAvatarUploader() {
  console.log('[AvatarUploader] Opening uploader');
  const modal = createUploaderModal();
  document.body.appendChild(modal);
  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });
}
function createUploaderModal() {
  const modal = document.createElement('div');
  modal.className = 'avatar-uploader-modal';
  modal.id = 'avatarUploaderModal';
  const currentUser = state.getUser();
  const hasAvatar = currentUser && currentUser.avatarUrl;
  modal.innerHTML = `
    <div class="avatar-uploader-modal__overlay"></div>
    <div class="avatar-uploader-modal__content">
      <div class="avatar-uploader-modal__header">
        <h2>Загрузить аватар</h2>
        <button class="avatar-uploader-modal__close" id="closeUploaderModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="avatar-uploader-modal__body">
        <!-- Current Avatar Preview -->
        <div class="avatar-preview" id="avatarPreview">
          ${hasAvatar 
            ? `<img src="${currentUser.avatarUrl}" alt="Current avatar">` 
            : `<div class="avatar-preview__placeholder">
                 <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                   <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" 
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                 </svg>
               </div>`
          }
        </div>
        <!-- Upload Area -->
        <div class="upload-area" id="uploadArea">
          <input type="file" id="avatarInput" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
          <div class="upload-area__content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" 
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p>Нажмите или перетащите изображение</p>
            <span>PNG, JPG, WebP, GIF (макс. 5MB)</span>
          </div>
        </div>
        <!-- Actions -->
        <div class="avatar-uploader-modal__actions">
          ${hasAvatar ? '<button type="button" class="btn-danger" id="removeAvatarBtn">Удалить аватар</button>' : ''}
          <button type="button" class="btn-secondary" id="cancelUploadBtn">Отмена</button>
          <button type="button" class="btn-primary" id="uploadAvatarBtn" disabled>Загрузить</button>
        </div>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector('#closeUploaderModal');
  const overlay = modal.querySelector('.avatar-uploader-modal__overlay');
  const cancelBtn = modal.querySelector('#cancelUploadBtn');
  const uploadArea = modal.querySelector('#uploadArea');
  const fileInput = modal.querySelector('#avatarInput');
  const uploadBtn = modal.querySelector('#uploadAvatarBtn');
  const removeBtn = modal.querySelector('#removeAvatarBtn');
  closeBtn.addEventListener('click', () => closeUploaderModal(modal));
  overlay.addEventListener('click', () => closeUploaderModal(modal));
  cancelBtn.addEventListener('click', () => closeUploaderModal(modal));
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFileSelect(e, modal));
  uploadBtn.addEventListener('click', () => handleUpload(modal));
  if (removeBtn) {
    removeBtn.addEventListener('click', () => handleRemoveAvatar(modal));
  }
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0], modal);
    }
  });
  return modal;
}
function handleFileSelect(e, modal) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file, modal);
  }
}
function handleFile(file, modal) {
  if (file.size > 5 * 1024 * 1024) {
    showToast('Файл слишком большой (макс. 5MB)', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('Можно загружать только изображения', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = modal.querySelector('#avatarPreview');
    preview.innerHTML = `<img src="${e.target.result}" alt="New avatar">`;
    const uploadBtn = modal.querySelector('#uploadAvatarBtn');
    uploadBtn.disabled = false;
    modal.dataset.selectedFile = e.target.result;
    modal.dataset.fileName = file.name;
  };
  reader.readAsDataURL(file);
}
async function handleUpload(modal) {
  const uploadBtn = modal.querySelector('#uploadAvatarBtn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Загрузка...';
  try {
    const fileInput = modal.querySelector('#avatarInput');
    const file = fileInput.files[0];
    if (!file) {
      throw new Error('No file selected');
    }
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: formData
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({
        avatarAttachmentId: data.attachment.id
      })
    });
    console.log('[AvatarUploader] Avatar uploaded successfully');
    showToast('Аватар успешно загружен', 'success');
    setTimeout(() => window.location.reload(), 1000);
    closeUploaderModal(modal);
  } catch (error) {
    console.error('[AvatarUploader] Upload failed:', error);
    showToast('Ошибка при загрузке аватара', 'error');
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Загрузить';
  }
}
async function handleRemoveAvatar(modal) {
  if (!confirm('Удалить текущий аватар?')) {
    return;
  }
  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({
        removeAvatar: true
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    console.log('[AvatarUploader] Avatar removed successfully');
    showToast('Аватар удалён', 'success');
    setTimeout(() => window.location.reload(), 1000);
    closeUploaderModal(modal);
  } catch (error) {
    console.error('[AvatarUploader] Remove failed:', error);
    showToast('Ошибка при удалении аватара', 'error');
  }
}
function closeUploaderModal(modal) {
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
