import state from '../state.js';
import { getUserColor, getUserInitials, escapeHtml } from '../utils.js';
export function showConversationInfo() {
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) return;
  const conversation = state.getConversation(conversationId);
  if (!conversation) return;
  const infoRail = document.getElementById('infoRail');
  const participantsList = document.getElementById('participantList');
  const memberCountEl = document.getElementById('infoPanelMemberCount');
  if (!infoRail || !participantsList) return;
  infoRail.classList.remove('hidden');
  loadInfoParticipants(conversationId, participantsList, memberCountEl);
}
async function loadInfoParticipants(conversationId, participantsList, memberCountEl) {
  try {
    const members = state.getMembers(conversationId) || [];
    if (memberCountEl) {
      memberCountEl.textContent = members.length;
    }
    if (!participantsList) return;
    const currentUser = state.getUser();
    participantsList.innerHTML = members.map(member => {
      const userId = member.id || member.user_id;
      const isCurrentUser = userId === currentUser.id;
      const userColor = member.avatarColor || member.avatar_color || getUserColor(userId, member.username);
      const userInitials = getUserInitials(member.displayName || member.display_name || member.username);
      const isOnline = state.isUserOnline(userId);
      return `
        <div class="participant-item" data-user-id="${userId}">
          <div class="participant-avatar" style="background: ${userColor};">
            ${(member.avatarUrl || member.avatar_url) ? `
              <img src="${member.avatarUrl || member.avatar_url}" alt="${escapeHtml(member.username)}" />
            ` : `
              <span class="user-avatar-initials">${userInitials}</span>
            `}
            ${isOnline ? '<div class="online-indicator"></div>' : ''}
          </div>
          <div class="participant-info">
            <div class="participant-name" style="color: ${userColor};">
              ${escapeHtml(member.displayName || member.display_name || member.username)}
              ${isCurrentUser ? '<span class="badge-you">Вы</span>' : ''}
            </div>
            <div class="participant-status">${isOnline ? 'Онлайн' : 'Оффлайн'}</div>
          </div>
        </div>
      `;
    }).join('');
    participantsList.querySelectorAll('.participant-item').forEach(item => {
      item.addEventListener('click', async () => {
        const userId = parseInt(item.dataset.userId, 10);
        if (userId) {
          const { showUserProfile } = await import('../modals.js');
          showUserProfile(userId);
        }
      });
    });
  } catch (error) {
    console.error('[ConversationInfo] Failed to load participants:', error);
  }
}
export function updateConversationInfo() {
  const conversationId = state.getCurrentConversationId();
  if (!conversationId) return;
  const infoRail = document.getElementById('infoRail');
  if (!infoRail || infoRail.classList.contains('hidden')) return;
  showConversationInfo();
}
