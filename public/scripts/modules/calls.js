import state from './state.js';
import callManager from './audio-relay.js';
let callModal;
let localVideo;
let remoteVideo;
let callStatus;
let callTimer;
let muteBtn;
let videoBtn;
let shareBtn;
let hangupBtn;
let acceptBtn;
let rejectBtn;
let incomingCallControls;
let activeCallControls;
let callStartTime;
let timerInterval;
export function init() {
  callModal = document.getElementById('callModal');
  localVideo = document.getElementById('localVideo');
  remoteVideo = document.getElementById('remoteVideo');
  callStatus = document.getElementById('callStatus');
  callTimer = document.getElementById('callTimer');
  muteBtn = document.getElementById('muteCallBtn');
  videoBtn = document.getElementById('toggleVideoBtn');
  shareBtn = document.getElementById('shareScreenBtn');
  hangupBtn = document.getElementById('hangupBtn');
  acceptBtn = document.getElementById('acceptCallBtn');
  rejectBtn = document.getElementById('rejectCallBtn');
  incomingCallControls = document.getElementById('incomingCallControls');
  activeCallControls = document.getElementById('activeCallControls');
  setupEventListeners();
}
function setupEventListeners() {
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      callManager.toggleMute();
    });
  }
  if (videoBtn) {
    videoBtn.addEventListener('click', () => {
      callManager.toggleVideo();
    });
  }
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      callManager.toggleScreenShare();
    });
  }
  if (hangupBtn) {
    hangupBtn.addEventListener('click', () => {
      callManager.endCall();
    });
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      callManager.acceptCall();
    });
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      const conversationId = state.getCurrentCall()?.conversationId;
      if (conversationId) {
        callManager.rejectCall(conversationId);
      }
      hideCallModal();
    });
  }
}
export function showCallModal(options) {
  const {
    conversationId,
    isOutgoing,
    hasVideo,
    status
  } = options;
  if (!callModal) return;
  const conversation = state.getConversation(conversationId);
  const title = conversation?.title || 'Звонок';
  const callTitle = callModal.querySelector('#callTitle');
  if (callTitle) {
    callTitle.textContent = title;
  }
  updateCallStatus(status, isOutgoing);
  if (videoBtn) {
    videoBtn.style.display = hasVideo ? 'flex' : 'none';
  }
  if (status === 'incoming') {
    if (incomingCallControls) incomingCallControls.classList.remove('hidden');
    if (activeCallControls) activeCallControls.classList.add('hidden');
  } else {
    if (incomingCallControls) incomingCallControls.classList.add('hidden');
    if (activeCallControls) activeCallControls.classList.remove('hidden');
  }
  if (callTimer) {
    callTimer.textContent = '00:00';
  }
  callModal.classList.remove('hidden');
  console.log('[Calls UI] Modal shown:', options);
}
export function hideCallModal() {
  if (!callModal) return;
  callModal.classList.add('hidden');
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (localVideo) {
    localVideo.srcObject = null;
  }
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
  console.log('[Calls UI] Modal hidden');
}
export function updateCallUI(updates) {
  const {
    status,
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    error
  } = updates;
  if (status) {
    updateCallStatus(status);
    if (status === 'connected' && !timerInterval) {
      startCallTimer();
    }
  }
  if (localStream && localVideo) {
    localVideo.srcObject = localStream;
    localVideo.muted = true;
  }
  if (remoteStream && remoteVideo) {
    remoteVideo.srcObject = remoteStream;
  }
  if (isMuted !== undefined && muteBtn) {
    muteBtn.classList.toggle('active', isMuted);
    const icon = muteBtn.querySelector('svg');
    if (icon) {
      icon.innerHTML = isMuted
        ? '<path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
        : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
    }
  }
  if (isVideoEnabled !== undefined && videoBtn) {
    videoBtn.classList.toggle('active', !isVideoEnabled);
    const icon = videoBtn.querySelector('svg');
    if (icon) {
      icon.innerHTML = isVideoEnabled
        ? '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'
        : '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';
    }
  }
  if (isScreenSharing !== undefined && shareBtn) {
    shareBtn.classList.toggle('active', isScreenSharing);
  }
  if (error && callStatus) {
    callStatus.textContent = error;
    callStatus.style.color = 'var(--accent-red)';
  }
  console.log('[Calls UI] UI updated:', updates);
}
function updateCallStatus(status, isOutgoing = false) {
  if (!callStatus) return;
  const statusTexts = {
    calling: isOutgoing ? 'Вызов...' : 'Входящий звонок...',
    connecting: 'Соединение...',
    connected: 'Разговор',
    ended: 'Завершён',
    rejected: 'Отклонён',
    failed: 'Ошибка соединения',
    error: 'Ошибка'
  };
  callStatus.textContent = statusTexts[status] || status;
  callStatus.style.color = status === 'connected' 
    ? 'var(--accent-green)' 
    : 'var(--text-primary)';
}
function startCallTimer() {
  callStartTime = Date.now();
  const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    if (callTimer) {
      callTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  };
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}
export function showIncomingCall(callData) {
  const { conversationId, hasVideo, callerId, callerName } = callData;
  const conversation = state.getConversation(conversationId);
  const displayName = callerName || conversation?.title || 'Неизвестный';
  const notification = document.createElement('div');
  notification.className = 'incoming-call-notification';
  notification.innerHTML = `
    <div class="incoming-call-content">
      <div class="incoming-call-icon">
        ${hasVideo ? 
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' :
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
        }
      </div>
      <div class="incoming-call-info">
        <h3>${displayName}</h3>
        <p>${hasVideo ? 'Видео звонок' : 'Голосовой звонок'}</p>
      </div>
      <div class="incoming-call-actions">
        <button class="call-action-btn reject-btn" id="rejectIncomingCall">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            <line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2"/>
          </svg>
        </button>
        <button class="call-action-btn accept-btn" id="acceptIncomingCall">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(notification);
  const rejectBtn = document.getElementById('rejectIncomingCall');
  const acceptBtn = document.getElementById('acceptIncomingCall');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      callManager.rejectCall(conversationId);
      notification.remove();
    });
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      notification.remove();
      await callManager.answerCall(callData.offer, conversationId, hasVideo);
    });
  }
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
      callManager.rejectCall(conversationId);
    }
  }, 30000);
}
export function showIncomingCallModal({ conversationId, caller, hasVideo, onAccept, onDecline }) {
  console.log('[Calls] Showing incoming call modal from:', caller.displayName);
  const existing = document.getElementById('incomingCallModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'incomingCallModal';
  modal.className = 'incoming-call-modal-overlay';
  const avatarContent = caller.avatarUrl 
    ? `<img src="${caller.avatarUrl}" alt="${caller.displayName}" class="incoming-call-avatar-img">` 
    : `<div class="incoming-call-avatar-letter" style="background: ${caller.avatarColor || '#6366f1'}">${caller.displayName[0].toUpperCase()}</div>`;
  modal.innerHTML = `
    <div class="incoming-call-modal-content">
      <div class="incoming-call-animation">
        <div class="incoming-call-pulse"></div>
        <div class="incoming-call-pulse"></div>
        <div class="incoming-call-pulse"></div>
      </div>
      <div class="incoming-call-avatar">
        ${avatarContent}
      </div>
      <div class="incoming-call-info">
        <h2 class="incoming-call-name">${caller.displayName}</h2>
        <p class="incoming-call-type">
          ${hasVideo ? '📹 Видеозвонок' : '📞 Голосовой звонок'}
        </p>
      </div>
      <div class="incoming-call-actions">
        <button class="incoming-call-btn decline-btn" id="declineIncomingCallBtn">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 1L1 23M1 1l22 22"/>
          </svg>
          <span>Отклонить</span>
        </button>
        <button class="incoming-call-btn accept-btn" id="acceptIncomingCallBtn">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <span>Ответить</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const declineBtn = document.getElementById('declineIncomingCallBtn');
  const acceptBtn = document.getElementById('acceptIncomingCallBtn');
  declineBtn.onclick = () => {
    modal.remove();
    if (onDecline) onDecline();
  };
  acceptBtn.onclick = () => {
    modal.remove();
    if (onAccept) onAccept();
  };
  setTimeout(() => {
    if (modal.parentNode) {
      modal.remove();
      if (onDecline) onDecline();
    }
  }, 60000);
}
