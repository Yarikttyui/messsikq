import state from '../../state.js';
let searchResults = [];
let currentResultIndex = -1;
let searchQuery = '';
export function showSearchBar(conversationId) {
  console.log('[ConversationSearch] Show search bar for conversation:', conversationId);
  const conversationHeader = document.querySelector('.conversation-header');
  if (!conversationHeader) return;
  let searchBar = document.querySelector('.conversation-search-bar');
  if (searchBar) {
    focusSearchInput();
    return;
  }
  searchBar = document.createElement('div');
  searchBar.className = 'conversation-search-bar';
  searchBar.innerHTML = `
    <div class="search-bar-container">
      <input 
        type="text" 
        class="search-input" 
        id="conversationSearchInput"
        placeholder="Поиск в беседе..."
        autocomplete="off"
      />
      <div class="search-navigation">
        <span class="search-results-count" id="searchResultsCount"></span>
        <button class="btn-icon" id="searchPrevBtn" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <button class="btn-icon" id="searchNextBtn" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <button class="btn-icon" id="closeSearchBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  `;
  conversationHeader.insertAdjacentElement('afterend', searchBar);
  requestAnimationFrame(() => {
    searchBar.classList.add('show');
  });
  const searchInput = searchBar.querySelector('#conversationSearchInput');
  const prevBtn = searchBar.querySelector('#searchPrevBtn');
  const nextBtn = searchBar.querySelector('#searchNextBtn');
  const closeBtn = searchBar.querySelector('#closeSearchBtn');
  searchInput.addEventListener('input', debounce((e) => {
    performSearch(conversationId, e.target.value);
  }, 300));
  prevBtn.addEventListener('click', () => navigateToPrevResult());
  nextBtn.addEventListener('click', () => navigateToNextResult());
  closeBtn.addEventListener('click', () => hideSearchBar());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateToPrevResult();
      } else {
        navigateToNextResult();
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSearchBar();
    }
  });
  focusSearchInput();
}
export function hideSearchBar() {
  const searchBar = document.querySelector('.conversation-search-bar');
  if (!searchBar) return;
  clearHighlights();
  searchBar.classList.remove('show');
  setTimeout(() => searchBar.remove(), 300);
  searchResults = [];
  currentResultIndex = -1;
  searchQuery = '';
  console.log('[ConversationSearch] Search bar hidden');
}
async function performSearch(conversationId, query) {
  searchQuery = query.trim();
  if (!searchQuery) {
    clearHighlights();
    updateSearchUI(0, 0);
    return;
  }
  console.log('[ConversationSearch] Searching for:', searchQuery);
  try {
    const response = await fetch(
      `/api/conversations/${conversationId}/search?q=${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    searchResults = data.results || [];
    console.log('[ConversationSearch] Found', searchResults.length, 'results');
    highlightResults(searchQuery);
    if (searchResults.length > 0) {
      currentResultIndex = 0;
      navigateToResult(0);
    } else {
      currentResultIndex = -1;
    }
    updateSearchUI(searchResults.length, currentResultIndex + 1);
  } catch (error) {
    console.error('[ConversationSearch] Search failed:', error);
    searchResults = [];
    currentResultIndex = -1;
    updateSearchUI(0, 0);
  }
}
function highlightResults(query) {
  clearHighlights();
  if (!query) return;
  const messages = document.querySelectorAll('.message-content');
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  messages.forEach(messageContent => {
    const messageId = messageContent.closest('[data-message-id]')?.dataset.messageId;
    if (!messageId) return;
    const isResult = searchResults.some(r => r.id === parseInt(messageId));
    if (!isResult) return;
    const originalText = messageContent.textContent;
    const highlightedText = originalText.replace(regex, '<mark class="search-highlight">$1</mark>');
    if (originalText !== highlightedText) {
      messageContent.innerHTML = highlightedText;
    }
  });
}
function clearHighlights() {
  document.querySelectorAll('.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.textContent = parent.textContent; // Убрать <mark>
  });
  document.querySelectorAll('.message-item.search-current').forEach(item => {
    item.classList.remove('search-current');
  });
}
function navigateToPrevResult() {
  if (searchResults.length === 0) return;
  currentResultIndex--;
  if (currentResultIndex < 0) {
    currentResultIndex = searchResults.length - 1;
  }
  navigateToResult(currentResultIndex);
  updateSearchUI(searchResults.length, currentResultIndex + 1);
}
function navigateToNextResult() {
  if (searchResults.length === 0) return;
  currentResultIndex++;
  if (currentResultIndex >= searchResults.length) {
    currentResultIndex = 0;
  }
  navigateToResult(currentResultIndex);
  updateSearchUI(searchResults.length, currentResultIndex + 1);
}
function navigateToResult(index) {
  if (index < 0 || index >= searchResults.length) return;
  const result = searchResults[index];
  const messageEl = document.querySelector(`[data-message-id="${result.id}"]`);
  if (!messageEl) {
    console.warn('[ConversationSearch] Message element not found:', result.id);
    return;
  }
  document.querySelectorAll('.message-item.search-current').forEach(item => {
    item.classList.remove('search-current');
  });
  messageEl.classList.add('search-current');
  messageEl.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  console.log('[ConversationSearch] Navigated to result', index + 1, '/', searchResults.length);
}
function updateSearchUI(totalResults, currentIndex) {
  const resultsCount = document.getElementById('searchResultsCount');
  const prevBtn = document.getElementById('searchPrevBtn');
  const nextBtn = document.getElementById('searchNextBtn');
  if (!resultsCount || !prevBtn || !nextBtn) return;
  if (totalResults === 0) {
    resultsCount.textContent = searchQuery ? 'Не найдено' : '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  } else {
    resultsCount.textContent = `${currentIndex} / ${totalResults}`;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
}
function focusSearchInput() {
  const searchInput = document.getElementById('conversationSearchInput');
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}
function debounce(func, wait) {
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
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
