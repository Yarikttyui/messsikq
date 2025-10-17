import socket from '../socket.js';
import state from '../state.js';
export function showJoinConversationModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container join-conversation-modal">
      <div class="modal-header">
        <h2 class="modal-title">Присоединиться к беседе</h2>
        <button class="modal-close-btn" id="closeJoinModal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="join-conversation-content">
          <div class="join-illustration">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p class="join-description">
            Введите код приглашения, чтобы присоединиться к беседе
          </p>
          <div class="form-group">
            <label for="joinCodeInput">Код приглашения</label>
            <input 
              type="text" 
              id="joinCodeInput" 
              class="form-input code-input" 
              placeholder="XXXXXXXX"
              maxlength="12"
              autocomplete="off"
              spellcheck="false"
            />
            <span class="form-hint">Код состоит из 12 символов</span>
          </div>
          <div class="join-error hidden" id="joinError">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="joinErrorText">Неверный код приглашения</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancelJoinBtn">Отмена</button>
        <button class="btn-primary" id="joinConversationBtn" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Присоединиться
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const closeBtn = modal.querySelector('#closeJoinModal');
  const cancelBtn = modal.querySelector('#cancelJoinBtn');
  const joinBtn = modal.querySelector('#joinConversationBtn');
  const codeInput = modal.querySelector('#joinCodeInput');
  const errorDiv = modal.querySelector('#joinError');
  const errorText = modal.querySelector('#joinErrorText');
  const closeModal = () => modal.remove();
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  codeInput.addEventListener('input', (e) => {
    const code = e.target.value.trim().toUpperCase();
    e.target.value = code;
    joinBtn.disabled = code.length !== 12;
    errorDiv.classList.add('hidden');
  });
  setTimeout(() => codeInput.focus(), 100);
  codeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !joinBtn.disabled) {
      joinBtn.click();
    }
  });
  joinBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 12) {
      showError('Код должен содержать 12 символов');
      return;
    }
    joinBtn.disabled = true;
    joinBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      Подключение...
    `;
    try {
      socket.socket.emit('conversation:join', { code }, (response) => {
        if (response.ok) {
          showToast('Вы присоединились к беседе!', 'success');
          if (response.conversation) {
            state.addConversation(response.conversation);
            state.setCurrentConversation(response.conversation.id);
          }
          closeModal();
        } else {
          showError(response.message || 'Не удалось присоединиться к беседе');
          joinBtn.disabled = false;
          joinBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Присоединиться
          `;
        }
      });
    } catch (error) {
      console.error('[JoinConversation] Error:', error);
      showError('Произошла ошибка при подключении');
      joinBtn.disabled = false;
    }
  });
  function showError(message) {
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
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
