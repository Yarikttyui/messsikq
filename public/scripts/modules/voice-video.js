import state from './state.js';
import socket from './socket.js';
let mediaRecorder = null;
let recordingChunks = [];
let recordingStream = null;
let recordingStartTime = null;
let recordingTimerInterval = null;
let recordingType = null; 
let replyingToMessage = null;
let recordingModal;
let recordingTitle;
let recordingVideoPreview;
let recordingWaveform;
let recordingTimer;
let cancelRecordingBtn;
let stopRecordingBtn;
let sendRecordingBtn;
export function init() {
  recordingModal = document.getElementById('recordingModal');
  recordingTitle = document.getElementById('recordingTitle');
  recordingVideoPreview = document.getElementById('recordingVideoPreview');
  recordingWaveform = document.getElementById('recordingWaveform');
  recordingTimer = document.getElementById('recordingTimer');
  cancelRecordingBtn = document.getElementById('cancelRecordingBtn');
  stopRecordingBtn = document.getElementById('stopRecordingBtn');
  sendRecordingBtn = document.getElementById('sendRecordingBtn');
  setupEventListeners();
}
function setupEventListeners() {
  if (stopRecordingBtn) {
    stopRecordingBtn.addEventListener('click', stopRecording);
  }
  if (cancelRecordingBtn) {
    cancelRecordingBtn.addEventListener('click', cancelRecording);
  }
  if (sendRecordingBtn) {
    sendRecordingBtn.addEventListener('click', sendRecording);
  }
}
export async function startRecording(type, replyTo = null) {
  try {
    recordingType = type;
    replyingToMessage = replyTo;
    const constraints = type === 'video' 
      ? { video: { width: 640, height: 640, facingMode: 'user' }, audio: true }
      : { audio: true };
    recordingStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!recordingModal) return;
    if (recordingTitle) {
      recordingTitle.textContent = type === 'video' ? 'Видео кружок' : 'Голосовое сообщение';
    }
    if (type === 'video' && recordingVideoPreview) {
      recordingVideoPreview.srcObject = recordingStream;
      recordingVideoPreview.classList.remove('hidden');
      if (recordingWaveform) recordingWaveform.classList.add('hidden');
    } else if (recordingWaveform) {
      recordingWaveform.classList.remove('hidden');
      if (recordingVideoPreview) recordingVideoPreview.classList.add('hidden');
      startWaveformVisualization(recordingStream);
    }
    const mimeType = type === 'video' 
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType });
    recordingChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordingChunks.push(e.data);
      }
    };
    mediaRecorder.start();
    recordingStartTime = Date.now();
    updateRecordingTimer();
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
    recordingModal.classList.remove('hidden');
    if (sendRecordingBtn) sendRecordingBtn.classList.add('hidden');
    if (stopRecordingBtn) stopRecordingBtn.classList.remove('hidden');
  } catch (error) {
    console.error('[Voice/Video] Failed to start recording:', error);
    let errorMessage = 'Не удалось начать запись';
    if (error.name === 'NotAllowedError') {
      errorMessage = type === 'video' 
        ? 'Доступ к камере и микрофону запрещен'
        : 'Доступ к микрофону запрещен';
    } else if (error.name === 'NotFoundError') {
      errorMessage = type === 'video'
        ? 'Камера или микрофон не найдены'
        : 'Микрофон не найден';
    }
    showToast(errorMessage, 'error');
  }
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
    }
    if (sendRecordingBtn) sendRecordingBtn.classList.remove('hidden');
    if (stopRecordingBtn) stopRecordingBtn.classList.add('hidden');
  }
}
async function sendRecording() {
  if (recordingChunks.length === 0) {
    showToast('Нет записи для отправки', 'error');
    return;
  }
  const mimeType = recordingType === 'video' ? 'video/webm' : 'audio/webm';
  const blob = new Blob(recordingChunks, { type: mimeType });
  const duration = Date.now() - recordingStartTime;
  cleanup();
  if (recordingModal) recordingModal.classList.add('hidden');
  await uploadAndSendRecording(blob, recordingType, duration);
}
function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  recordingChunks = [];
  cleanup();
  if (recordingModal) recordingModal.classList.add('hidden');
}
function updateRecordingTimer() {
  if (!recordingTimer || !recordingStartTime) return;
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  recordingTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
async function uploadAndSendRecording(blob, type, duration) {
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) return;
  try {
    showToast('Отправка...', 'info');
    const formData = new FormData();
    const extension = 'webm';
    const filename = `${type}_${Date.now()}.${extension}`;
    formData.append('file', blob, filename);
    formData.append('duration', Math.floor(duration));
    formData.append('circle', type === 'video' ? 'true' : 'false');
    formData.append('type', type === 'video' ? 'video_note' : 'voice');
    console.log('[Voice/Video] Uploading file:', filename, 'size:', blob.size, 'duration:', duration);
    const response = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Voice/Video] Upload failed:', response.status, errorText);
      throw new Error('Upload failed');
    }
    const data = await response.json();
    console.log('[Voice/Video] File uploaded:', data);
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
    console.log('[Voice/Video] Sending message:', messageData);
    socket.socket.emit('message:create', messageData);
    showToast('Отправлено', 'success');
  } catch (error) {
    console.error('[Voice/Video] Failed to upload recording:', error);
    showToast('Ошибка отправки', 'error');
  }
}
function startWaveformVisualization(stream) {
  if (!recordingWaveform) return;
  const ctx = recordingWaveform.getContext('2d');
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const draw = () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      audioContext.close();
      return;
    }
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, recordingWaveform.width, recordingWaveform.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgb(37, 99, 235)'; // Blue
    ctx.beginPath();
    const sliceWidth = recordingWaveform.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * recordingWaveform.height / 2;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.lineTo(recordingWaveform.width, recordingWaveform.height / 2);
    ctx.stroke();
  };
  draw();
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
  if (recordingVideoPreview) {
    recordingVideoPreview.srcObject = null;
  }
  mediaRecorder = null;
  recordingChunks = [];
  recordingStartTime = null;
  recordingType = null;
  replyingToMessage = null;
}
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
