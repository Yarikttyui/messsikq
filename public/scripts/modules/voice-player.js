let currentAudio = null;
let currentPlayBtn = null;
export function init() {
  console.log('[VoicePlayer] Initialized');
}
export function playVoiceMessage(btn) {
  const audioUrl = btn.dataset.audioUrl;
  if (!audioUrl) {
    console.error('[VoicePlayer] No audio URL found');
    return;
  }
  if (currentAudio && currentPlayBtn === btn) {
    if (currentAudio.paused) {
      currentAudio.play();
      updatePlayButton(btn, true);
    } else {
      currentAudio.pause();
      updatePlayButton(btn, false);
    }
    return;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    if (currentPlayBtn) {
      updatePlayButton(currentPlayBtn, false);
    }
  }
  currentAudio = new Audio(audioUrl);
  currentPlayBtn = btn;
  currentAudio.addEventListener('ended', () => {
    updatePlayButton(btn, false);
    currentAudio = null;
    currentPlayBtn = null;
  });
  currentAudio.addEventListener('error', (e) => {
    console.error('[VoicePlayer] Audio playback error:', e);
    showToast('Ошибка воспроизведения', 'error');
    updatePlayButton(btn, false);
    currentAudio = null;
    currentPlayBtn = null;
  });
  currentAudio.play().catch(error => {
    console.error('[VoicePlayer] Failed to play audio:', error);
    showToast('Ошибка воспроизведения', 'error');
  });
  updatePlayButton(btn, true);
}
function updatePlayButton(btn, isPlaying) {
  btn.innerHTML = isPlaying 
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
export function playVideoCircle(video, btn) {
  if (!video || !btn) {
    console.error('[VoicePlayer] Video or button not found');
    return;
  }
  if (video.paused) {
    video.play().catch(error => {
      console.error('[VoicePlayer] Failed to play video:', error);
      showToast('Ошибка воспроизведения видео', 'error');
    });
    btn.style.display = 'none';
    const handleEnded = () => {
      btn.style.display = 'flex';
      video.currentTime = 0;
      video.removeEventListener('ended', handleEnded);
    };
    const handlePause = () => {
      btn.style.display = 'flex';
    };
    const handleVideoClick = () => {
      video.pause();
    };
    video.addEventListener('ended', handleEnded);
    video.addEventListener('pause', handlePause);
    video.addEventListener('click', handleVideoClick);
  } else {
    video.pause();
    btn.style.display = 'flex';
  }
}
export function renderVoiceMessage(attachment) {
  const duration = attachment.duration_ms ? formatDuration(attachment.duration_ms) : '0:00';
  const url = `/uploads/${attachment.stored_name}`;
  return `
    <div class="voice-message" data-attachment-id="${attachment.id}">
      <button class="voice-play-btn" data-audio-url="${url}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <div class="voice-waveform">
        <div class="voice-waveform-bar" style="height: 40%"></div>
        <div class="voice-waveform-bar" style="height: 60%"></div>
        <div class="voice-waveform-bar" style="height: 80%"></div>
        <div class="voice-waveform-bar" style="height: 100%"></div>
        <div class="voice-waveform-bar" style="height: 70%"></div>
        <div class="voice-waveform-bar" style="height: 50%"></div>
        <div class="voice-waveform-bar" style="height: 90%"></div>
        <div class="voice-waveform-bar" style="height: 60%"></div>
        <div class="voice-waveform-bar" style="height: 40%"></div>
        <div class="voice-waveform-bar" style="height: 30%"></div>
      </div>
      <span class="voice-duration">${duration}</span>
    </div>
  `;
}
export function renderVideoCircle(attachment) {
  const url = `/uploads/${attachment.stored_name}`;
  return `
    <div class="video-circle" data-attachment-id="${attachment.id}">
      <video class="video-circle-player" src="${url}" preload="metadata"></video>
      <button class="video-circle-play-btn">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    </div>
  `;
}
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
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
