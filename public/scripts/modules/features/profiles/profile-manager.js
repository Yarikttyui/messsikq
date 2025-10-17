import state from '../../state.js';
class ProfileManager {
  constructor() {
    this.currentProfile = null;
    this.cache = new Map();
    console.log('[ProfileManager] Initialized');
  }
  async loadProfile(userId) {
    try {
      if (this.cache.has(userId)) {
        console.log('[ProfileManager] Loading from cache:', userId);
        return this.cache.get(userId);
      }
      console.log('[ProfileManager] Fetching profile:', userId);
      const response = await fetch(`/api/users/${userId}/profile`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      this.cache.set(userId, data.profile);
      return data.profile;
    } catch (error) {
      console.error('[ProfileManager] Failed to load profile:', error);
      return null;
    }
  }
  async updateProfile(updates) {
    try {
      const currentUser = state.getUser();
      if (!currentUser) {
        throw new Error('Not authenticated');
      }
      console.log('[ProfileManager] Updating profile:', updates);
      const response = await fetch(`/api/users/${currentUser.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      this.cache.set(currentUser.id, data.profile);
      state.emit('profile:updated', data.profile);
      return data.profile;
    } catch (error) {
      console.error('[ProfileManager] Failed to update profile:', error);
      throw error;
    }
  }
  async updateStatus(status) {
    return this.updateProfile({ status });
  }
  async updateMood(mood) {
    return this.updateProfile({ mood });
  }
  async updateBio(bio) {
    return this.updateProfile({ bio });
  }
  async updatePrivacy(privacySettings) {
    return this.updateProfile(privacySettings);
  }
  clearCache() {
    this.cache.clear();
    console.log('[ProfileManager] Cache cleared');
  }
  getCachedProfile(userId) {
    return this.cache.get(userId);
  }
}
const profileManager = new ProfileManager();
export default profileManager;
export { ProfileManager };
