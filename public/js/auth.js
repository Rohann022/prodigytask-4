const api = (location.port && location.port !== '5000') ? 'http://localhost:5000/api/auth' : (location.origin + '/api/auth');

// Quick reachability check: sends a HEAD request with a timeout
const isBackendReachable = async (url, timeout = 3000) => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    // Use HEAD so we avoid hitting POST-only routes; a non-OK response still means reachable
    await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    return true;
  } catch {
    return false;
  }
};

const form = document.getElementById('auth-form');
const toggleBtn = document.getElementById('toggle-btn');
const title = document.getElementById('form-title');
const msg = document.getElementById('msg');

let isLogin = false;

const saveAndRedirect = (data) => {
  localStorage.setItem('token', data.token);
  window.location.href = 'chat.html';
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  try {
    const reachable = await isBackendReachable(api);
    if (!reachable) {
      msg.style.color = 'crimson';
      msg.textContent = `Backend unreachable at ${api}. Start the backend (npm start) on port 5000.`;
      return;
    }

    const res = await fetch(api + (isLogin ? '/login' : '/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Try to parse JSON body, but be resilient if response has no JSON
    let data = null;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.warn('Response had no JSON body', parseErr);
    }

    if (!res.ok) {
      console.error('Auth request failed', { url: res.url, status: res.status, body: data });
      const errMsg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
      msg.style.color = 'crimson';
      msg.textContent = errMsg;
      return;
    }

    console.info('Auth request succeeded', { url: res.url, status: res.status, body: data });

    if (isLogin) {
      saveAndRedirect(data);
    } else {
      msg.style.color = 'green';
      msg.textContent = 'Registered! You can now log in.';
      toggleMode();
    }
  } catch (err) {
    // Detect network errors and show a friendly, actionable message
    if (err.name === 'AbortError' || err instanceof TypeError || /failed to fetch/i.test(err.message || '')) {
      msg.style.color = 'crimson';
      msg.textContent = `Backend unreachable at ${api}. Start the backend (npm start) on port 5000.`;
    } else {
      msg.style.color = 'crimson';
      msg.textContent = err.message;
    }
  }
});

const applyMode = () => {
  document.getElementById('name').style.display = isLogin ? 'none' : 'block';
  title.textContent = isLogin ? 'Welcome back' : 'Create account';
  document.getElementById('submit-btn').textContent = isLogin ? 'Log in' : 'Register';
  toggleBtn.textContent = isLogin ? 'Create one' : 'Log in';
  // Ensure name is required only when registering
  document.getElementById('name').required = !isLogin;
  msg.textContent = '';
};

const toggleMode = () => {
  isLogin = !isLogin;
  applyMode();
};

// Initialize UI state based on current mode
applyMode();

toggleBtn.addEventListener('click', (e) => {
  e.preventDefault();
  toggleMode();
});
