import { init as initOrionApp } from './orion-app.js';
import initPrism from './effects/prism.js';
import { initV2Integration } from './modules/v2-integration.js';
import audioRelay from './modules/audio-relay.js';
async function loadFragment(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Failed to load fragment: ${path}`);
  }
  return response.text();
}
async function mountApplication() {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root container not found');
  }
  try {
    const [auth, app, modals] = await Promise.all([
      loadFragment('/views/auth.html'),
      loadFragment('/views/app.html'),
      loadFragment('/views/modals.html')
    ]);
    root.innerHTML = `${auth}\n${app}\n${modals}`;
    setTimeout(() => {
      const authScreen = document.querySelector('.auth-screen');
      if (authScreen) {
        console.log('Initializing Prism effect...');
        initPrism();
      }
    }, 100);
    initAuthHandlers();
    initOrionApp();
    initV2Integration();
    setTimeout(() => {
      audioRelay.setupSocketHandlers();
    }, 500);
  } catch (error) {
    console.error('Failed to mount application:', error);
    root.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; color: #E8ECF4; font-family: Inter, sans-serif;">
        <div style="text-align: center;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Failed to Load</h1>
          <p style="color: #A9B2C2;">${error.message}</p>
        </div>
      </div>
    `;
  }
}
function initAuthHandlers() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authTabs = document.querySelectorAll('.auth-tab');
  const authLinks = document.querySelectorAll('.auth-link');
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      switchAuthForm(target);
    });
  });
  authLinks.forEach(link => {
    link.addEventListener('click', () => {
      const target = link.dataset.switch;
      switchAuthForm(target);
    });
  });
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
}
function switchAuthForm(target) {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');
  tabs.forEach(tab => {
    if (tab.dataset.target === target) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  forms.forEach(form => {
    if (form.id === `${target}Form`) {
      form.classList.add('active');
    } else {
      form.classList.remove('active');
    }
  });
}
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) {
    alert('Please fill in all fields');
    return;
  }
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    sessionStorage.setItem('token', data.token);
    window.location.reload();
  } catch (error) {
    console.error('Login error:', error);
    alert(error.message);
  }
}
async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;
  if (!username || !password) {
    alert('Please fill in all fields');
    return;
  }
  if (password.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }
    sessionStorage.setItem('token', data.token);
    window.location.reload();
  } catch (error) {
    console.error('Registration error:', error);
    alert(error.message);
  }
}
mountApplication().catch(error => {
  console.error('Fatal error:', error);
});
