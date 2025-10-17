import state from '../state.js';
const PRESET_BACKGROUNDS = [
  {
    id: 'default',
    name: 'По умолчанию',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))'
  },
  {
    id: 'dark-blue',
    name: 'Темно-синий',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(13, 27, 42, 0.95), rgba(27, 38, 59, 0.95))'
  },
  {
    id: 'purple',
    name: 'Фиолетовый',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(44, 13, 44, 0.95), rgba(56, 28, 85, 0.95))'
  },
  {
    id: 'teal',
    name: 'Бирюзовый',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(13, 44, 44, 0.95), rgba(28, 85, 85, 0.95))'
  },
  {
    id: 'orange',
    name: 'Оранжевый',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(44, 27, 13, 0.95), rgba(85, 56, 28, 0.95))'
  },
  {
    id: 'green',
    name: 'Зеленый',
    type: 'gradient',
    value: 'linear-gradient(135deg, rgba(13, 44, 27, 0.95), rgba(28, 85, 56, 0.95))'
  },
  {
    id: 'matrix',
    name: 'Матрица',
    type: 'pattern',
    value: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2300ff41\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"), linear-gradient(135deg, rgba(0, 20, 0, 0.95), rgba(0, 40, 10, 0.95))'
  },
  {
    id: 'dots',
    name: 'Точки',
    type: 'pattern',
    value: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'1\'/%3E%3C/g%3E%3C/svg%3E"), linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))'
  }
];
export function showBackgroundCustomizer(conversationId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container background-customizer-modal">
      <div class="modal-header">
        <h2 class="modal-title">Фон чата</h2>
        <button class="modal-close-btn" id="closeBackgroundModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="background-tabs">
          <button class="bg-tab active" data-tab="presets">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            Готовые
          </button>
          <button class="bg-tab" data-tab="custom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Свое изображение
          </button>
          <button class="bg-tab" data-tab="color">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            Цвет
          </button>
        </div>
        <div class="background-content">
          <!-- Preset backgrounds -->
          <div class="bg-tab-content active" data-content="presets">
            <div class="presets-grid">
              ${PRESET_BACKGROUNDS.map(preset => `
                <div class="preset-item" data-background-id="${preset.id}">
                  <div class="preset-preview" style="background: ${preset.value}"></div>
                  <div class="preset-name">${preset.name}</div>
                  <div class="preset-check">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <!-- Custom image -->
          <div class="bg-tab-content" data-content="custom">
            <div class="custom-bg-upload">
              <div class="upload-area" id="uploadArea">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <h3>Загрузить изображение</h3>
                <p>Перетащите файл или кликните для выбора</p>
                <input type="file" id="bgFileInput" accept="image/*" style="display: none;" />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  await loadCurrentBackground(conversationId, modal.querySelectorAll('.bg-preset-item'));
  setupBackgroundEventListeners(modal, conversationId);
}
export function applyBackgroundToChat(background) {
  const messagesContainer = document.querySelector('.messages-container');
  if (!messagesContainer) return;
  if (!background) {
    messagesContainer.style.background = '';
    return;
  }
  switch (background.type) {
    case 'preset':
    case 'color':
      messagesContainer.style.background = background.value;
      break;
    case 'image':
      messagesContainer.style.background = `url('${background.value}') center/cover, rgba(13, 17, 23, 0.9)`;
      break;
  }
}
async function saveBackground(conversationId, background) {
  const token = sessionStorage.getItem('token');
  await fetch(`/api/conversations/${conversationId}/background`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ background })
  });
}
async function loadCurrentBackground(conversationId, presetItems) {
  try {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/conversations/${conversationId}/background`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return;
    const { background } = await response.json();
    if (background && background.type === 'preset') {
      const preset = Array.from(presetItems).find(
        item => item.dataset.backgroundId === background.id
      );
      if (preset) {
        preset.classList.add('selected');
      }
    }
  } catch (error) {
    console.error('[Background] Load error:', error);
  }
}
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
