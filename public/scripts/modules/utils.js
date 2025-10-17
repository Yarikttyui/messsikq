export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    console.warn('Invalid timestamp:', timestamp);
    return '';
  }
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days === 0) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  if (days === 1) {
    return 'Вчера';
  }
  if (days < 7) {
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return weekdays[date.getDay()];
  }
  if (date.getFullYear() === now.getFullYear()) {
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
export function formatDate(dateString) {
  if (!dateString) return 'Сегодня';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    return 'Сегодня';
  }
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) {
    return 'Сегодня';
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  if (d.getFullYear() === today.getFullYear()) {
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
export function formatLastSeen(timestamp) {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;
  let currentGroup = null;
  messages.forEach(msg => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      currentGroup = {
        date: msgDate,
        messages: [msg]
      };
      groups.push(currentGroup);
    } else {
      currentGroup.messages.push(msg);
    }
  });
  return groups;
}
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
export function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
export function parseMentions(text) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}
export function highlightMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
}
export function showNotification(title, options = {}) {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return;
  }
  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
}
export function getAvatarColor(str) {
  const colors = [
    '#00E5FF', '#3B82F6', '#8B5CF6', '#EC4899', 
    '#F59E0B', '#10B981', '#06B6D4', '#6366F1'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
export function isScrolledToBottom(element, threshold = 100) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}
export function scrollToElement(element, options = {}) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    ...options
  });
}
export function getUserColor(userId, username) {
  const colors = [
    '#FF6B6B', 
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#BB8FCE',
    '#85C1E2',
    '#F8B739',
    '#52B788',
    '#E06377',
    '#5DADE2',
    '#AF7AC5',
    '#58D68D',
    '#EC7063',
    '#AED6F1',
    '#F5B7B1',
    '#A9DFBF',
    '#FAD7A0',
    '#D7BDE2',
  ];
  const hash = userId || hashString(username || 'User');
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}
export function getUserInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
export function generateUserAvatar(user, size = 40) {
  if (!user) {
    return `<div class="user-avatar" style="width: ${size}px; height: ${size}px; background: #666;">?</div>`;
  }
  const color = user.avatar_color || getUserColor(user.id, user.username);
  const initials = getUserInitials(user.display_name || user.username);
  if (user.avatar_url || user.avatar) {
    const avatarPath = user.avatar_url || `/uploads/${user.avatar}`;
    return `
      <div class="user-avatar" style="width: ${size}px; height: ${size}px;" data-user-id="${user.id}">
        <img src="${avatarPath}" alt="${escapeHtml(user.display_name || user.username)}" />
      </div>
    `;
  }
  return `
    <div class="user-avatar" style="width: ${size}px; height: ${size}px; background: ${color};" data-user-id="${user.id}">
      <span class="user-avatar-initials">${initials}</span>
    </div>
  `;
}
export function getContrastColor(hexColor) {
  const color = hexColor.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
