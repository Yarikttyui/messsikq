const API_BASE = window.location.origin;
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
async function request(endpoint, options = {}) {
  const token = sessionStorage.getItem('token');
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  };
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(
        data.message || 'Request failed',
        response.status,
        data
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error', 0, { originalError: error.message });
  }
}
async function uploadFile(file, onProgress) {
  const token = sessionStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new ApiError('Upload failed', xhr.status, JSON.parse(xhr.responseText)));
      }
    });
    xhr.addEventListener('error', () => {
      reject(new ApiError('Network error', 0));
    });
    xhr.open('POST', `${API_BASE}/api/uploads`);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}
export const auth = {
  async register(username, password) {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  async login(username, password) {
    return request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  async getProfile() {
    return request('/api/profile');
  },
  async updateProfile(updates) {
    return request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }
};
export const conversations = {
  async getAll() {
    return request('/api/conversations');
  },
  async getById(id) {
    return request(`/api/conversations/${id}`);
  },
  async create(data) {
    if (data.type === 'direct') {
      return request('/api/conversations/direct', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
    return request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  async update(id, updates) {
    return request(`/api/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },
  async delete(id) {
    return request(`/api/conversations/${id}`, {
      method: 'DELETE'
    });
  },
  async getMembers(id) {
    return request(`/api/conversations/${id}/members`);
  },
  async addMember(conversationId, userId) {
    return request(`/api/conversations/${conversationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },
  async removeMember(conversationId, userId) {
    return request(`/api/conversations/${conversationId}/members/${userId}`, {
      method: 'DELETE'
    });
  },
  async updateMemberRole(conversationId, userId, role) {
    return request(`/api/conversations/${conversationId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  },
  async joinByCode(code) {
    return request('/api/conversations/join', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }
};
export const messages = {
  async getByConversation(conversationId, limit = 50, before = null) {
    const params = new URLSearchParams({ limit });
    if (before) params.append('before', before);
    return request(`/api/conversations/${conversationId}/messages?${params}`);
  },
  async send(conversationId, content, attachments = null) {
    return request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, attachments })
    });
  },
  async update(messageId, content) {
    return request(`/api/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },
  async delete(messageId) {
    return request(`/api/messages/${messageId}`, {
      method: 'DELETE'
    });
  },
  async addReaction(messageId, emoji) {
    return request(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
  },
  async removeReaction(messageId, emoji) {
    return request(`/api/messages/${messageId}/reactions`, {
      method: 'DELETE',
      body: JSON.stringify({ emoji })
    });
  },
  async pin(messageId) {
    return request(`/api/messages/${messageId}/pin`, {
      method: 'POST'
    });
  },
  async unpin(messageId) {
    return request(`/api/messages/${messageId}/pin`, {
      method: 'DELETE'
    });
  },
  async favorite(messageId) {
    return request(`/api/messages/${messageId}/favorite`, {
      method: 'POST'
    });
  },
  async unfavorite(messageId) {
    return request(`/api/messages/${messageId}/favorite`, {
      method: 'DELETE'
    });
  }
};
export const users = {
  async search(query) {
    return request(`/api/users/search?q=${encodeURIComponent(query)}`);
  },
  async getById(id) {
    return request(`/api/users/${id}`);
  },
  async updateProfile(updates) {
    return request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }
};
export const uploads = {
  async upload(file, onProgress) {
    return uploadFile(file, onProgress);
  }
};
export { ApiError };
