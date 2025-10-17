import state from './state.js';
import socket from './socket.js';
import { messages as messagesApi } from './api.js';
import { formatTime, formatDate, groupMessagesByDate, getUserColor, getUserInitials, escapeHtml } from './utils.js';
import { startRecording } from './voice-system.js';
import { playVoiceMessage, playVideoCircle, renderVoiceMessage, renderVideoCircle } from './voice-player.js';
import { showMessageContextMenu } from './message-context-menu.js';
import { handleMemberJoined, handleMemberLeft, handleMemberRemoved } from './conversations/system-messages.js';
import { startEditingMessage } from './features/conversations/message-editing.js';
import { setReplyTo, getReplyTo, clearReplyTo } from './features/conversations/message-replies.js';
let canvasEmptyEl;
let canvasConversationEl;
let messagesScrollEl;
let messageInputEl;
let sendBtn;
let convTitleEl;
let convMetaEl;
let convAvatarEl;
let scrollToBottomBtn;
let replyPreviewEl;
let replyPreviewAuthorEl;
let replyPreviewTextEl;
let replyPreviewCloseBtn;
let typingTimeout;
let isUserScrolling = false;
export function init() {
  canvasEmptyEl = document.getElementById('canvasEmpty');
  canvasConversationEl = document.getElementById('canvasConversation');
  messagesScrollEl = document.getElementById('messagesScroll');
  messageInputEl = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendBtn');
  convTitleEl = document.getElementById('convTitle');
  convMetaEl = document.getElementById('convMeta');
  convAvatarEl = document.getElementById('convAvatar');
  replyPreviewEl = document.getElementById('replyPreview');
  replyPreviewAuthorEl = document.getElementById('replyPreviewAuthor');
  replyPreviewTextEl = document.getElementById('replyPreviewText');
  replyPreviewCloseBtn = document.getElementById('replyPreviewClose');
  setupScrollToBottom();
  if (replyPreviewCloseBtn) {
    replyPreviewCloseBtn.addEventListener('click', cancelReply);
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
  if (messageInputEl) {
    messageInputEl.addEventListener('input', () => {
      handleTyping();
      autoResizeTextarea();
    });
    messageInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  const attachBtn = document.getElementById('attachBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const videoBtn = document.getElementById('videoBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const stickerBtn = document.getElementById('stickerBtn');
  if (attachBtn) {
    attachBtn.addEventListener('click', handleAttachment);
  }
  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      startRecording('audio', getReplyTo());
    });
  }
  if (videoBtn) {
    videoBtn.addEventListener('click', () => {
      startRecording('video', getReplyTo());
    });
  }
  if (emojiBtn) {
    emojiBtn.addEventListener('click', handleEmojiPicker);
  }
  if (stickerBtn) {
    stickerBtn.addEventListener('click', async () => {
      const { showStickerPicker } = await import('./modals.js');
      showStickerPicker();
    });
  }
  state.on('conversation:changed', loadConversation);
  state.on('messages:updated', renderMessages);
  state.on('messages:update', handleMessagesUpdate);
  state.on('message:added', handleNewMessage);
  state.on('message:updated', handleMessageUpdate);
  state.on('message:deleted', handleMessageDelete);
  state.on('message:edit', handleEditMessage);
  state.on('message:reply', handleReplyMessage);
  state.on('member:joined', handleMemberJoined);
  state.on('member:left', handleMemberLeft);
  state.on('member:removed', handleMemberRemoved);
}
async function loadConversation(conversationId) {
  if (!conversationId) {
    showEmptyState();
    return;
  }
  const conversation = state.getConversation(conversationId);
  if (!conversation) {
    console.error('Conversation not found:', conversationId);
    return;
  }
  canvasEmptyEl.classList.add('hidden');
  canvasConversationEl.classList.remove('hidden');
  try {
    const data = await messagesApi.getByConversation(conversationId);
    state.setMessages(conversationId, data.messages || []);
    const { conversations } = await import('./api.js');
    const membersData = await conversations.getMembers(conversationId);
    state.setMembers(conversationId, membersData.members || []);
    updateHeader(conversation);
    socket.joinConversation(conversationId);
    socket.markAsRead(conversationId);
    state.setUnreadCount(conversationId, 0);
  } catch (error) {
    console.error('Failed to load conversation:', error);
    state.emit('error', { message: 'Не удалось загрузить сообщения' });
  }
}
function showEmptyState() {
  canvasEmptyEl.classList.remove('hidden');
  canvasConversationEl.classList.add('hidden');
}
function updateHeader(conversation) {
  convTitleEl.textContent = conversation.title || conversation.username || 'Unknown';
  const members = state.getMembers(conversation.id) || [];
  const onlineCount = members.filter(m => state.isUserOnline(m.user_id)).length;
  console.log('updateHeader:', { 
    conversationId: conversation.id, 
    membersCount: members.length, 
    members: members,
    type: conversation.type 
  });
  if (conversation.type === 'group') {
    const memberText = getPluralForm(members.length, 'участник', 'участника', 'участников');
    convMetaEl.textContent = `${members.length} ${memberText} • ${onlineCount} онлайн`;
  } else {
    const otherMember = members.find(m => m.user_id !== state.getUser().id);
    if (otherMember) {
      convMetaEl.textContent = state.isUserOnline(otherMember.user_id) ? 'Онлайн' : 'Оффлайн';
    }
  }
  convAvatarEl.innerHTML = ''; // Очистить старое содержимое
  const userName = conversation.title || conversation.username || 'Unknown';
  if (conversation.avatar) {
    const img = document.createElement('img');
    img.src = `/uploads/${conversation.avatar}`;
    img.alt = userName;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '50%';
    convAvatarEl.appendChild(img);
  } else {
    const userId = conversation.other_user_id || conversation.id;
    const userColor = getUserColor(userId, userName);
    const initials = getUserInitials(userName);
    convAvatarEl.style.background = userColor;
    convAvatarEl.innerHTML = `<span class="user-avatar-initials">${initials}</span>`;
  }
  convAvatarEl.onclick = null; // Remove old handler
  convAvatarEl.style.cursor = 'pointer';
  convAvatarEl.onclick = async () => {
    const currentConvId = state.getCurrentConversationId();
    if (conversation.type === 'direct') {
      const otherMember = members.find(m => m.user_id !== state.getUser().id);
      if (otherMember && otherMember.user_id) {
        const { showUserProfile } = await import('./modals.js');
        showUserProfile(otherMember.user_id);
      }
    } else {
      const { showConversationInfo } = await import('./modals.js');
      showConversationInfo(currentConvId, conversation);
    }
  };
}
function renderMessages({ conversationId, messages }) {
  if (conversationId !== state.getCurrentConversationId()) {
    return;
  }
  const grouped = groupMessagesByDate(messages);
  const currentUser = state.getUser();
  messagesScrollEl.innerHTML = grouped.map(group => {
    const dateHtml = `
      <div class="date-divider">
        <span class="date-chip">${formatDate(group.date)}</span>
      </div>
    `;
    const messagesHtml = groupConsecutiveMessages(group.messages, currentUser.id)
      .map(renderMessageGroup)
      .join('');
    return dateHtml + messagesHtml;
  }).join('');
  scrollToBottom();
  setTimeout(() => {
    setupMessageActions();
  }, 0);
}
function groupConsecutiveMessages(messages, currentUserId) {
  const groups = [];
  let currentGroup = null;
  messages.forEach(msg => {
    const userData = msg.user || {};
    const userId = userData.id || msg.user_id;
    const isOwn = userId === currentUserId;
    if (!currentGroup || currentGroup.userId !== userId) {
      currentGroup = {
        userId: userId,
        username: userData.username || msg.username,
        displayName: userData.displayName || msg.display_name || userData.username || msg.username,
        avatar: userData.avatarUrl || msg.avatar_url || msg.avatar,
        avatarColor: userData.avatarColor || msg.avatar_color,
        isOwn,
        messages: [msg]
      };
      groups.push(currentGroup);
    } else {
      currentGroup.messages.push(msg);
    }
  });
  return groups;
}
function renderMessageGroup(group) {
  const userColor = group.avatarColor || getUserColor(group.userId, group.username);
  const userInitials = getUserInitials(group.displayName || group.username);
  let avatarHtml;
  if (group.avatar) {
    avatarHtml = `<img src="/uploads/${group.avatar}" alt="${escapeHtml(group.username)}" style="width: 100%; height: 100%; object-fit: cover;" />`;
  } else {
    avatarHtml = `<span class="user-avatar-initials">${userInitials}</span>`;
  }
  const bubblesHtml = group.messages.map(msg => {
    let attachments = [];
    if (msg.attachments) {
      try {
        attachments = typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments;
        if (!Array.isArray(attachments)) attachments = [];
      } catch (e) {
        attachments = [];
      }
    }
    const attachmentsHtml = attachments.map(att => {
      if (att.kind === 'voice') {
        return renderVoiceMessage(att);
      } else if (att.kind === 'video_note' || att.is_circle) {
        return renderVideoCircle(att);
      } else {
        return renderFileAttachment(att);
      }
    }).join('');
    let replyPreviewHtml = '';
    if (msg.replyTo && msg.replyTo.id) {
      const replyContent = msg.replyTo.content || '[Вложение]';
      const replyAuthor = msg.replyTo.user?.displayName || msg.replyTo.user?.username || 'Пользователь';
      replyPreviewHtml = `
        <div class="message-reply-preview" data-parent-id="${msg.replyTo.id}">
          <div class="message-reply-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
            </svg>
            <span class="message-reply-label">Reply to ${escapeHtml(replyAuthor)}</span>
          </div>
          <div class="message-reply-text">${escapeHtml(replyContent.substring(0, 100))}</div>
        </div>
      `;
    }
    let reactionsHtml = '';
    if (msg.reactions && msg.reactions.length > 0) {
      const grouped = {};
      msg.reactions.forEach(r => {
        if (!grouped[r.emoji]) {
          grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        grouped[r.emoji].count++;
        grouped[r.emoji].users.push(r.user_id);
      });
      const currentUser = state.getUser();
      reactionsHtml = '<div class="message-reactions">' + 
        Object.values(grouped).map(r => {
          const hasReacted = currentUser && r.users.includes(currentUser.id);
          return `
            <button class="message-reaction ${hasReacted ? 'reacted' : ''}" 
                    data-emoji="${r.emoji}"
                    title="${r.count} реакций">
              <span class="message-reaction__emoji">${r.emoji}</span>
              <span class="message-reaction__count">${r.count}</span>
            </button>
          `;
        }).join('') +
        '</div>';
    }
    return `
    <div class="message-bubble message-item" data-id="${msg.id}" data-message-id="${msg.id}" data-sender-id="${group.userId}" data-created-at="${msg.created_at || msg.timestamp || new Date().toISOString()}">
      ${!group.isOwn ? `<div class="message-sender message-sender-name" style="color: ${userColor}; font-weight: 600;">${escapeHtml(group.displayName || group.username)}</div>` : ''}
      ${replyPreviewHtml}
      ${attachmentsHtml}
      ${msg.content ? `<div class="message-text message-content">${escapeHtml(msg.content)}</div>` : ''}
      <div class="message-meta">
        <span class="message-time">
          ${formatTime(msg.created_at || msg.timestamp || new Date().toISOString())}
          ${msg.editedAt || msg.edited_at ? '<span class="message-edited-label">(изменено)</span>' : ''}
        </span>
      </div>
      ${reactionsHtml}
    </div>
  `;
  }).join('');
  return `
    <div class="message-group ${group.isOwn ? 'own' : ''}" data-user-id="${group.userId}">
      ${!group.isOwn ? `
        <div class="message-sender-avatar clickable" style="background: ${userColor};" data-user-id="${group.userId}">
          ${avatarHtml}
        </div>
      ` : ''}
      <div class="message-bubbles">
        ${bubblesHtml}
      </div>
    </div>
  `;
}
function setupMessageActions() {
  const avatars = messagesScrollEl.querySelectorAll('.message-sender-avatar.clickable');
  console.log('Setting up avatar clicks, found:', avatars.length);
  avatars.forEach(avatar => {
    avatar.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = parseInt(avatar.dataset.userId);
      console.log('Avatar clicked, userId:', userId);
      if (userId) {
        const { showUserProfile } = await import('./modals.js');
        showUserProfile(userId);
      }
    });
  });
  messagesScrollEl.querySelectorAll('.message-bubble').forEach(bubble => {
    setupVoicePlayer(bubble);
  });
  messagesScrollEl.querySelectorAll('.message-bubble').forEach(bubble => {
    bubble.addEventListener('contextmenu', (e) => {
      const messageId = parseInt(bubble.dataset.messageId);
      if (messageId) {
        const messages = state.getMessages(state.getCurrentConversationId());
        const messageData = messages.find(m => m.id === messageId);
        if (messageData) {
          showMessageContextMenu(bubble, messageData, e);
        }
      }
    });
  });
  messagesScrollEl.querySelectorAll('.message-reaction').forEach(reactionBtn => {
    reactionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const emoji = reactionBtn.dataset.emoji;
      const messageEl = reactionBtn.closest('[data-message-id]');
      const messageId = parseInt(messageEl.dataset.messageId);
      if (messageId && emoji) {
        try {
          const response = await fetch(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionStorage.getItem('token')}`
            },
            body: JSON.stringify({ emoji })
          });
          if (response.ok) {
            const data = await response.json();
            const { updateReactionsUI } = await import('./features/conversations/message-reactions.js');
            updateReactionsUI(messageId, data.reactions);
          }
        } catch (error) {
          console.error('Failed to toggle reaction:', error);
        }
      }
    });
  });
  messagesScrollEl.querySelectorAll('.message-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const bubble = btn.closest('.message-bubble');
      const messageId = parseInt(bubble.dataset.id);
      switch (action) {
        case 'reply':
          handleReply(messageId);
          break;
        case 'react':
          break;
        case 'edit':
          break;
        case 'delete':
          await deleteMessage(messageId);
          break;
        case 'more':
          break;
      }
    });
  });
  messagesScrollEl.querySelectorAll('.voice-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playVoiceMessage(btn);
    });
  });
  messagesScrollEl.querySelectorAll('.video-circle-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const videoCircle = btn.closest('.video-circle');
      const video = videoCircle.querySelector('.video-circle-player');
      playVideoCircle(video, btn);
    });
  });
}
async function sendMessage() {
  if (!messageInputEl) {
    console.error('[Messages] ❌ Message input element not found');
    return;
  }
  const content = (messageInputEl.value || '').trim();
  if (!content) {
    return;
  }
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) {
    console.error('[Messages] ❌ No conversation selected');
    return;
  }
  try {
    const replyToData = getReplyTo();
    const parentId = replyToData?.id || null;
    console.log('[Messages] 📤 Sending message');
    console.log('[Messages] 💬 Content:', content.substring(0, 50));
    console.log('[Messages] 🔗 Reply to ID:', parentId);
    console.log('[Messages] 📊 Reply data:', replyToData);
    messageInputEl.value = '';
    autoResizeTextarea();
    if (socket && socket.stopTyping) {
      socket.stopTyping(conversationId);
    }
    socket.socket.emit('message:create', {
      conversationId,
      content,
      parentId  // ✅ Передаём ИМЕННО parentId (reply_to_id)
    });
    console.log('[Messages] ✅ Message sent successfully');
    console.log('[Messages] 🗑️ Now clearing reply preview');
    if (parentId) {
      clearReplyTo();
      console.log('[Messages] ✅ Reply cleared');
    }
  } catch (error) {
    console.error('[Messages] ❌ Failed to send message:', error);
    state.emit('error', { message: 'Не удалось отправить сообщение: ' + (error.message || 'Неизвестная ошибка') });
    messageInputEl.value = content;
  }
}
function handleTyping() {
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) {
    return;
  }
  socket.startTyping(conversationId);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.stopTyping(conversationId);
  }, 3000);
}
function handleNewMessage({ conversationId, message }) {
  if (conversationId === state.getCurrentConversationId()) {
    renderMessages({
      conversationId,
      messages: state.getMessages(conversationId)
    });
    const currentUser = state.getUser();
    if (!isUserScrolling || message.user_id === currentUser.id) {
      scrollToBottom(true);
    }
  }
}
function handleMessageUpdate({ conversationId }) {
  if (conversationId === state.getCurrentConversationId()) {
    renderMessages({
      conversationId,
      messages: state.getMessages(conversationId)
    });
  }
}
function handleMessageDelete({ conversationId }) {
  if (conversationId === state.getCurrentConversationId()) {
    renderMessages({
      conversationId,
      messages: state.getMessages(conversationId)
    });
  }
}
function handleMessagesUpdate({ conversationId }) {
  if (conversationId === state.getCurrentConversationId()) {
    renderMessages({
      conversationId,
      messages: state.getMessages(conversationId)
    });
  }
}
function handleEditMessage({ messageData }) {
  console.log('[Messages] Edit message:', messageData);
  startEditingMessage(messageData);
}
function handleReplyMessage(messageData) {
  console.log('[Messages] Reply to message:', messageData);
  setReplyTo(messageData);
  if (messageInputEl) {
    messageInputEl.focus();
  }
}
async function deleteMessage(messageId) {
  if (!confirm('Delete this message?')) {
    return;
  }
  try {
    await messagesApi.delete(messageId);
  } catch (error) {
    console.error('Failed to delete message:', error);
    state.emit('error', { message: 'Не удалось удалить сообщение' });
  }
}
async function uploadAndSendFile(file, conversationId) {
  const { showToast } = await import('./modals.js');
  try {
    showToast('Загрузка файла...', 'info');
    const token = sessionStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData,
      credentials: 'include'
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Messages] Upload failed:', response.status, errorText);
      throw new Error('Upload failed');
    }
    const data = await response.json();
    const attachmentId = data.attachment?.id;
    if (!attachmentId) {
      throw new Error('No attachment ID in response');
    }
    const replyTo = getReplyTo();
    const messageData = {
      conversationId,
      content: '',
      attachments: [attachmentId],
      parentId: replyTo?.id || null
    };
    socket.socket.emit('message:create', messageData);
    if (getReplyTo()) {
      clearReplyTo();
    }
    showToast('Файл отправлен', 'success');
  } catch (error) {
    console.error('[Messages] Failed to upload file:', error);
    throw error;
  }
}
function handleAttachment() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,video/*,audio/*';
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    for (const file of files) {
      await uploadAttachment(file);
    }
  };
  input.click();
}
async function handleEmojiPicker() {
  const { showEmojiPicker } = await import('./modals.js');
  showEmojiPicker((emoji) => {
    const start = messageInputEl.selectionStart;
    const end = messageInputEl.selectionEnd;
    const text = messageInputEl.value;
    messageInputEl.value = text.substring(0, start) + emoji + text.substring(end);
    messageInputEl.selectionStart = messageInputEl.selectionEnd = start + emoji.length;
    messageInputEl.focus();
    autoResizeTextarea();
  });
}
function autoResizeTextarea() {
  if (!messageInputEl) return;
  messageInputEl.style.height = 'auto';
  messageInputEl.style.height = Math.min(messageInputEl.scrollHeight, 120) + 'px';
}
function getPluralForm(number, one, few, many) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}
function setupScrollToBottom() {
  scrollToBottomBtn = document.createElement('button');
  scrollToBottomBtn.className = 'scroll-to-bottom';
  scrollToBottomBtn.setAttribute('aria-label', 'Прокрутить вниз');
  scrollToBottomBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  const messagesArea = document.querySelector('.messages-area');
  if (messagesArea) {
    messagesArea.appendChild(scrollToBottomBtn);
  }
  scrollToBottomBtn.addEventListener('click', () => {
    scrollToBottom(true);
  });
  if (messagesScrollEl) {
    messagesScrollEl.addEventListener('scroll', handleScroll);
  }
}
function handleScroll() {
  if (!messagesScrollEl || !scrollToBottomBtn) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesScrollEl;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  if (distanceFromBottom > 200) {
    scrollToBottomBtn.classList.add('visible');
    isUserScrolling = true;
  } else {
    scrollToBottomBtn.classList.remove('visible');
    isUserScrolling = false;
  }
}
function scrollToBottom(smooth = false) {
  if (!messagesScrollEl) return;
  messagesScrollEl.scrollTo({
    top: messagesScrollEl.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
  isUserScrolling = false;
}
function handleReply(messageId) {
  const conversationId = state.getCurrentConversationId();
  const messages = state.getMessages(conversationId);
  const message = messages.find(m => m.id === messageId);
  if (!message) return;
  setReplyTo(message);
  if (messageInputEl) messageInputEl.focus();
}
function cancelReply() {
  clearReplyTo();
}
function renderFileAttachment(attachment) {
  const size = attachment.size ? formatFileSize(attachment.size) : '';
  const fileUrl = attachment.url || `/uploads/${attachment.stored_name}`;
  if (attachment.kind === 'audio' || attachment.fileType === 'voice') {
    const duration = attachment.durationMs ? formatDuration(attachment.durationMs) : '';
    return `
      <div class="message-voice-attachment">
        <div class="voice-player">
          <button class="voice-play-btn" data-audio-url="${fileUrl}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div class="voice-waveform">
            <audio src="${fileUrl}" preload="metadata"></audio>
            <div class="voice-progress-bar">
              <div class="voice-progress-fill"></div>
            </div>
          </div>
          ${duration ? `<span class="voice-duration">${duration}</span>` : ''}
        </div>
      </div>
    `;
  }
  if (attachment.isCircle || attachment.fileType === 'video_note') {
    return `
      <div class="message-video-note">
        <video 
          controls 
          src="${fileUrl}" 
          style="border-radius: 50%; width: 200px; height: 200px; object-fit: cover; background: #000;"
          preload="metadata">
          Ваш браузер не поддерживает видео
        </video>
      </div>
    `;
  }
  if (attachment.kind === 'video') {
    return `
      <div class="message-video-attachment">
        <video 
          controls 
          src="${fileUrl}" 
          style="max-width: 400px; max-height: 300px; border-radius: 12px;"
          preload="metadata">
          Ваш браузер не поддерживает видео
        </video>
      </div>
    `;
  }
  if (attachment.kind === 'image') {
    return `
      <div class="message-image-attachment">
        <img 
          src="${fileUrl}" 
          alt="${escapeHtml(attachment.file_name)}"
          style="max-width: 400px; max-height: 400px; border-radius: 12px; cursor: pointer;"
          onclick="window.open('${fileUrl}', '_blank')"
        />
      </div>
    `;
  }
  const icon = getFileIcon(attachment.mime_type);
  return `
    <div class="file-attachment" data-attachment-id="${attachment.id}">
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(attachment.file_name)}</div>
        ${size ? `<div class="file-size">${size}</div>` : ''}
      </div>
      <a href="${fileUrl}" download="${attachment.file_name}" class="file-download-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      </a>
    </div>
  `;
}
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
function setupVoicePlayer(messageEl) {
  const playBtns = messageEl.querySelectorAll('.voice-play-btn');
  playBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const audioUrl = this.dataset.audioUrl;
      const playerDiv = this.closest('.voice-player');
      const audioEl = playerDiv.querySelector('audio');
      if (!audioEl) return;
      if (audioEl.paused) {
        document.querySelectorAll('.message-voice-attachment audio').forEach(a => {
          if (a !== audioEl) a.pause();
        });
        audioEl.play();
        this.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
          </svg>
        `;
      } else {
        audioEl.pause();
        this.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        `;
      }
      audioEl.onended = () => {
        this.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        `;
      };
      audioEl.ontimeupdate = () => {
        const progressFill = playerDiv.querySelector('.voice-progress-fill');
        if (progressFill && audioEl.duration) {
          const percent = (audioEl.currentTime / audioEl.duration) * 100;
          progressFill.style.width = percent + '%';
        }
      };
    });
  });
}
function getFileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return '🗜️';
  return '📄';
}
