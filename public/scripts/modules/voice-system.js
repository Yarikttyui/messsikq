import state from './state.js';
import socket from './socket.js';
let mediaRecorder = null;
let recordingChunks = [];
let recordingStream = null;
let recordingStartTime = null;
let recordingTimerInterval = null;
let recordingType = null;
let recordingModal = null;
let replyingToMessage = null;
function showRecordingModal(type) {
  if (recordingModal) {
    hideRecordingModal();
  }
  recordingModal = document.createElement('div');
  recordingModal.className = 'voice-recording-modal';
  recordingModal.innerHTML = `
    <div class="recording-overlay"></div>
    <div class="recording-content">
      <h3 class="recording-title">${type === 'video' ? 'Видео кружок' : 'Голосовое сообщение'}</h3>
      ${type === 'video' ? '<video class="recording-video" id="recordingVideo" autoplay muted></video>' : ''}
      <div class="recording-visualizer">
        <canvas id="recordingCanvas" width="300" height="80"></canvas>
      </div>
      <div class="recording-timer" id="recordingTimer">00:00</div>
      <div class="recording-actions">
        <button class="btn-recording-cancel" id="cancelRecordingBtn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span>Отмена</span>
        </button>
        <button class="btn-recording-stop" id="stopRecordingBtn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          <span>Остановить</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(recordingModal);
  const cancelBtn = recordingModal.querySelector('#cancelRecordingBtn');
  const stopBtn = recordingModal.querySelector('#stopRecordingBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelRecording);
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', stopRecording);
  }
  if (type === 'video') {
    const videoEl = recordingModal.querySelector('#recordingVideo');
    if (videoEl && recordingStream) {
      videoEl.srcObject = recordingStream;
    }
  }
  requestAnimationFrame(() => {
    recordingModal.classList.add('active');
  });
}
function hideRecordingModal() {
  if (!recordingModal) return;
  recordingModal.classList.remove('active');
  setTimeout(() => {
    if (recordingModal && recordingModal.parentNode) {
      recordingModal.remove();
    }
    recordingModal = null;
  }, 300);
}
function updateTimer() {
  if (!recordingStartTime || !recordingModal) return;
  const elapsed = Date.now() - recordingStartTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const timerEl = recordingModal.querySelector('#recordingTimer');
  if (timerEl) {
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
}
let audioContext = null;
let analyser = null;
let dataArray = null;
let animationId = null;
function setupVisualization(stream) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    drawVisualization();
  } catch (error) {
    console.error('[VoiceSystem] Visualization setup failed:', error);
  }
}
function drawVisualization() {
  if (!recordingModal) return;
  const canvas = recordingModal.querySelector('#recordingCanvas');
  if (!canvas || !analyser || !dataArray) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  animationId = requestAnimationFrame(drawVisualization);
  analyser.getByteFrequencyData(dataArray);
  ctx.fillStyle = '#1e2124';
  ctx.fillRect(0, 0, width, height);
  const barWidth = 3;
  const gap = 2;
  const barCount = Math.floor(width / (barWidth + gap));
  for (let i = 0; i < barCount; i++) {
    const index = Math.floor(i * dataArray.length / barCount);
    const value = dataArray[index];
    const barHeight = (value / 255) * height * 0.8;
    const x = i * (barWidth + gap);
    const y = height / 2 - barHeight / 2;
    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#4ECDC4');
    gradient.addColorStop(1, '#2196F3');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);
  }
}
function stopVisualization() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  analyser = null;
  dataArray = null;
}
async function startRecording(type = 'audio', replyTo = null) {
  try {
    console.log('[VoiceSystem] Starting recording:', type);
    recordingType = type;
    replyingToMessage = replyTo;
    const constraints = type === 'video'
      ? { video: { width: 640, height: 640, facingMode: 'user' }, audio: true }
      : { audio: true };
    recordingStream = await navigator.mediaDevices.getUserMedia(constraints);
    const mimeType = type === 'video' ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType });
    recordingChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordingChunks.push(e.data);
      }
    };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start(100);
    recordingStartTime = Date.now();
    recordingTimerInterval = setInterval(updateTimer, 100);
    showRecordingModal(type);
    setupVisualization(recordingStream);
    console.log('[VoiceSystem] Recording started');
  } catch (error) {
    console.error('[VoiceSystem] Failed to start recording:', error);
    showToast('Ошибка доступа к микрофону/камере', 'error');
    cleanup();
  }
}
function stopRecording() {
  console.log('[VoiceSystem] Stopping recording');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
function cancelRecording() {
  console.log('[VoiceSystem] Canceling recording');
  recordingChunks = [];
  cleanup();
  hideRecordingModal();
  showToast('Запись отменена', 'info');
}
async function handleRecordingStop() {
  console.log('[VoiceSystem] Recording stopped, chunks:', recordingChunks.length);
  if (recordingChunks.length === 0) {
    showToast('Нет записи для отправки', 'error');
    cleanup();
    hideRecordingModal();
    return;
  }
  const duration = Date.now() - recordingStartTime;
  const blob = new Blob(recordingChunks, { type: recordingType === 'video' ? 'video/webm' : 'audio/webm' });
  console.log('[VoiceSystem] Blob created:', blob.size, 'bytes, duration:', duration, 'ms');
  stopVisualization();
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
  showSendButtons(blob, duration);
}
function showSendButtons(blob, duration) {
  if (!recordingModal) return;
  const actionsDiv = recordingModal.querySelector('.recording-actions');
  if (!actionsDiv) return;
  actionsDiv.innerHTML = `
    <button class="btn-recording-cancel" id="cancelSendBtn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      <span>Отмена</span>
    </button>
    <button class="btn-recording-send" id="sendRecordingBtn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      <span>Отправить</span>
    </button>
  `;
  const cancelSendBtn = recordingModal.querySelector('#cancelSendBtn');
  const sendBtn = recordingModal.querySelector('#sendRecordingBtn');
  if (cancelSendBtn) {
    cancelSendBtn.addEventListener('click', () => {
      recordingChunks = [];
      cleanup();
      hideRecordingModal();
      showToast('Запись отменена', 'info');
    });
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      cleanup();
      hideRecordingModal();
      await uploadAndSend(blob, recordingType, duration);
    });
  }
}
function cleanup() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
  }
  stopVisualization();
  mediaRecorder = null;
  recordingStartTime = null;
}
async function uploadAndSend(blob, type, duration) {
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) {
    console.error('[VoiceSystem] No conversation selected');
    showToast('Выберите беседу', 'error');
    return;
  }
  try {
    showToast('Отправка...', 'info');
    const token = sessionStorage.getItem('token');
    if (!token) {
      throw new Error('No auth token');
    }
    const formData = new FormData();
    const extension = 'webm';
    const filename = `${type}_${Date.now()}.${extension}`;
    formData.append('file', blob, filename);
    formData.append('duration', Math.floor(duration));
    formData.append('circle', type === 'video' ? 'true' : 'false');
    formData.append('type', type === 'video' ? 'video_note' : 'voice');
    console.log('[VoiceSystem] Uploading:', filename, blob.size, 'bytes');
    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VoiceSystem] Upload failed:', response.status, errorText);
      throw new Error(`Upload failed: ${response.status}`);
    }
    const data = await response.json();
    console.log('[VoiceSystem] Upload success:', data);
    const attachmentId = data.attachment?.id;
    if (!attachmentId) {
      throw new Error('No attachment ID in response');
    }
    const messageData = {
      conversationId,
      content: '',
      attachments: [attachmentId],
      parentId: replyingToMessage?.id || null
    };
    console.log('[VoiceSystem] Sending message:', messageData);
    socket.socket.emit('message:create', messageData);
    showToast('Отправлено', 'success');
  } catch (error) {
    console.error('[VoiceSystem] Upload/send failed:', error);
    showToast('Ошибка отправки', 'error');
  }
}
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `voice-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
export {
  startRecording,
  stopRecording,
  cancelRecording
};
export function startVoiceRecording(replyTo = null) {
  return startRecording('audio', replyTo);
}
export function startVideoRecording(replyTo = null) {
  return startRecording('video', replyTo);
}
