import state from '../../state.js';
const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];
export function showReactionPicker(messageId, targetElement) {
  console.log('[MessageReactions] Opening picker for message:', messageId);
  const existing = document.querySelector('.reaction-picker');
  if (existing) {
    existing.remove();
  }
  const picker = createReactionPicker(messageId);
  document.body.appendChild(picker);
  const rect = targetElement.getBoundingClientRect();
  picker.style.top = `${rect.top - picker.offsetHeight - 8}px`;
  picker.style.left = `${rect.left}px`;
  requestAnimationFrame(() => {
    picker.classList.add('visible');
  });
  setTimeout(() => {
    document.addEventListener('click', function closeOnClickOutside(e) {
      if (!picker.contains(e.target) && e.target !== targetElement) {
        picker.classList.remove('visible');
        setTimeout(() => picker.remove(), 200);
        document.removeEventListener('click', closeOnClickOutside);
      }
    });
  }, 100);
}
function createReactionPicker(messageId) {
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.dataset.messageId = messageId;
  picker.innerHTML = `
    <div class="reaction-picker__emojis">
      ${COMMON_EMOJIS.map(emoji => `
        <button class="reaction-picker__emoji" data-emoji="${emoji}">${emoji}</button>
      `).join('')}
    </div>
  `;
  const emojiButtons = picker.querySelectorAll('.reaction-picker__emoji');
  emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      handleReaction(messageId, emoji);
      picker.classList.remove('visible');
      setTimeout(() => picker.remove(), 200);
    });
  });
  return picker;
}
async function handleReaction(messageId, emoji) {
  try {
    console.log('[MessageReactions] Toggling reaction:', messageId, emoji);
    const response = await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      },
      body: JSON.stringify({ emoji })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    updateReactionsUI(messageId, data.reactions);
  } catch (error) {
    console.error('[MessageReactions] Failed to toggle reaction:', error);
  }
}
function updateReactionsUI(messageId, reactions) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) {
    console.warn('[MessageReactions] Message element not found:', messageId);
    return;
  }
  let reactionsContainer = messageEl.querySelector('.message-reactions');
  if (!reactionsContainer) {
    reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions';
    messageEl.appendChild(reactionsContainer);
  }
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) {
      grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    }
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.user_id);
  });
  reactionsContainer.innerHTML = Object.values(grouped).map(r => {
    const currentUser = state.getUser();
    const hasReacted = currentUser && r.users.includes(currentUser.id);
    return `
      <button class="message-reaction ${hasReacted ? 'reacted' : ''}" 
              data-emoji="${r.emoji}"
              title="${r.users.length} реакций">
        <span class="message-reaction__emoji">${r.emoji}</span>
        <span class="message-reaction__count">${r.count}</span>
      </button>
    `;
  }).join('');
  const reactionButtons = reactionsContainer.querySelectorAll('.message-reaction');
  reactionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      handleReaction(messageId, emoji);
    });
  });
}
export async function loadReactions(messageId) {
  try {
    const response = await fetch(`/api/messages/${messageId}/reactions`, {
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    updateReactionsUI(messageId, data.reactions);
  } catch (error) {
    console.error('[MessageReactions] Failed to load reactions:', error);
  }
}
export { handleReaction, updateReactionsUI };
