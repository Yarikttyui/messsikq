import state from './modules/state.js';
import socket from './modules/socket.js';
import { auth, conversations } from './modules/api.js';
import * as inbox from './modules/inbox.js';
import * as messages from './modules/messages.js';
import * as modals from './modules/modals.js';
import * as calls from './modules/calls.js';
import * as voicePlayer from './modules/voice-player.js';
import { startVoiceRecording, startVideoRecording } from './modules/voice-system.js';
import { initClickSpark } from './effects/click-spark.js';
export async function init() {
  console.log('Initializing Orion Messenger...');
  initTheme();
  const token = sessionStorage.getItem('token');
  if (!token) {
    console.log('No token found, showing auth screen');
    return;
  }
  try {
    const userData = await auth.getProfile();
    state.setUser(userData.user);
    socket.connect(token);
    inbox.init();
    messages.init();
    calls.init();
    voicePlayer.init();
    initRail();
    initInfoRail();
    initClickSpark({
      sparkColor: '#6366f1',
      sparkSize: 10,
      sparkRadius: 25,
      sparkCount: 8,
      duration: 400,
      easing: 'ease-out',
      extraScale: 1.2
    });
    await inbox.loadConversations();
    showApp();
    console.log('Orion Messenger initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    sessionStorage.removeItem('token');
    window.location.reload();
  }
}
function showApp() {
  const authScreen = document.querySelector('.auth-screen');
  const appShell = document.getElementById('appShell');
  if (authScreen) {
    authScreen.classList.add('hidden');
  }
  if (appShell) {
    appShell.classList.remove('hidden');
  }
  updateUserAvatar();
}
function initRail() {
  const railButtons = document.querySelectorAll('.rail-button');
  const userAvatar = document.getElementById('userAvatar');
  railButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      railButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switch (view) {
        case 'home':
        case 'messages':
          break;
        case 'channels':
          console.log('Channels view not implemented yet');
          break;
        case 'search':
          openCommandPalette();
          break;
        case 'settings':
          console.log('Settings not implemented yet');
          break;
      }
    });
  });
  if (userAvatar) {
    userAvatar.addEventListener('click', async () => {
      const { showProfileEditor } = await import('./modules/features/profiles/profile-editor.js');
      showProfileEditor();
    });
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Вы уверены, что хотите выйти?')) {
        logout();
      }
    });
  }
}
function updateUserAvatar() {
  const user = state.getUser();
  const avatarRing = document.querySelector('.avatar-ring');
  if (user && avatarRing) {
    if (user.avatar) {
      avatarRing.style.backgroundImage = `url(/uploads/${user.avatar})`;
      avatarRing.style.backgroundSize = 'cover';
    } else {
      const initials = getInitials(user.username);
      avatarRing.textContent = initials;
      avatarRing.style.display = 'flex';
      avatarRing.style.alignItems = 'center';
      avatarRing.style.justifyContent = 'center';
      avatarRing.style.fontSize = '18px';
      avatarRing.style.fontWeight = '600';
      avatarRing.style.color = 'white';
    }
  }
}
function initInfoRail() {
  const audioCallBtn = document.getElementById('audioCallBtn');
  const videoCallBtn = document.getElementById('videoCallBtn');
  console.log('[OrionApp] Call buttons found:', { audioCallBtn, videoCallBtn });
  if (audioCallBtn) {
    audioCallBtn.addEventListener('click', async () => {
      console.log('[OrionApp] Audio call button clicked');
      const conversationId = state.getCurrentConversationId();
      console.log('[OrionApp] Current conversation ID:', conversationId);
      if (conversationId) {
        try {
          console.log('[OrionApp] Importing audio relay module...');
          const audioRelay = await import('./modules/audio-relay.js').then(m => m.default);
          console.log('[OrionApp] AudioRelay imported:', audioRelay);
          console.log('[OrionApp] Starting audio call...');
          await audioRelay.startCall(conversationId, false);
        } catch (error) {
          console.error('[OrionApp] Failed to start audio call:', error);
        }
      } else {
        console.warn('[OrionApp] No conversation selected for audio call');
      }
    });
  }
  if (videoCallBtn) {
    videoCallBtn.addEventListener('click', async () => {
      console.log('[OrionApp] Video call button clicked');
      const conversationId = state.getCurrentConversationId();
      console.log('[OrionApp] Current conversation ID:', conversationId);
      if (conversationId) {
        try {
          console.log('[OrionApp] Importing audio relay module...');
          const audioRelay = await import('./modules/audio-relay.js').then(m => m.default);
          console.log('[OrionApp] AudioRelay imported:', audioRelay);
          console.log('[OrionApp] Starting video call...');
          await audioRelay.startCall(conversationId, true);
        } catch (error) {
          console.error('[OrionApp] Failed to start video call:', error);
        }
      } else {
        console.warn('[OrionApp] No conversation selected for video call');
      }
    });
  }
  const conversationSettingsBtn = document.getElementById('conversationSettingsBtn');
  if (conversationSettingsBtn) {
    conversationSettingsBtn.addEventListener('click', async () => {
      console.log('[OrionApp] Conversation settings button clicked');
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        try {
          const { showConversationSettings } = await import('./modules/conversation-settings.js');
          await showConversationSettings(conversationId);
        } catch (error) {
          console.error('[OrionApp] Failed to open conversation settings:', error);
        }
      } else {
        console.warn('[OrionApp] No conversation selected');
      }
    });
  }
  state.on('ui:compose', () => {
    modals.showCreateConversation();
  });
  const convMenuBtn = document.getElementById('convMenuBtn');
  if (convMenuBtn) {
    convMenuBtn.addEventListener('click', () => {
      const conversationId = state.getCurrentConversationId();
      if (conversationId) {
        modals.showConversationMenu(conversationId, convMenuBtn);
      }
    });
  }
  const convAvatar = document.getElementById('convAvatar');
  if (convAvatar) {
    convAvatar.addEventListener('click', () => {
      const conversationId = state.getCurrentConversationId();
      const conversation = state.getConversation(conversationId);
      if (conversationId && conversation) {
        modals.showConversationInfo(conversationId, conversation);
      }
    });
  }
}
function openCommandPalette() {
  console.log('Command palette not implemented yet');
  alert('Command Palette (⌘K)\n\nQuick actions:\n• Search conversations\n• Create new chat\n• Find users\n• Settings\n\nComing soon!');
}
export function logout() {
  socket.disconnect();
  state.clear();
  sessionStorage.removeItem('token');
  window.location.reload();
}
state.on('error', ({ message }) => {
  console.error('Application error:', message);
  alert(message);
});
state.on('socket:failed', () => {
  console.error('Socket connection failed');
  alert('Connection lost. Please check your internet connection.');
});
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
  if (e.key === 'n' && !isTyping()) {
    e.preventDefault();
    state.emit('ui:compose');
  }
  if (e.key === 'Escape') {
  }
});
function isTyping() {
  const activeElement = document.activeElement;
  return activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.isContentEditable
  );
}
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const savedColor = localStorage.getItem('accentColor');
  if (savedTheme === 'auto') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  if (savedColor) {
    document.documentElement.style.setProperty('--accent-cyan', savedColor);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('theme') === 'auto') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}
