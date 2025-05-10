// Wait for DOM to be fully loaded before attaching events
document.addEventListener('DOMContentLoaded', function() {
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const errorElement = document.getElementById('error-message');
  const loginForm = document.querySelector('form');
  
  console.log('DOM elements found:', {
    username: !!username,
    password: !!password,
    errorElement: !!errorElement,
    loginForm: !!loginForm
  });
  
  function displayError(message) {
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    } else {
      console.error(message);
    }
  }
  
  function login(e) {
    // If an event was passed, prevent default behavior
    if (e) e.preventDefault();
    
    console.log('Login function called');
    
    const usernameValue = username ? username.value : '';
    const passwordValue = password ? password.value : '';
    
    if (!usernameValue || !passwordValue) {
      displayError('Please enter both username and password.');
      return;
    }
    
    console.log('Sending login request to server');
    
    fetch(appConfig.apiEndpoint('/login'), {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ username: usernameValue, password: passwordValue })
    })
      .then(response => {
        console.log('Response status:', response.status);
        
        if (response.ok) {
          return response.json();
        } else if (response.status === 401) {
          throw new Error('Invalid username or password.');
        } else {
          throw new Error('Login failed. Please try again.');
        }
      })
      .then(data => {
        console.log('Login successful, redirecting...');
        localStorage.setItem('auth_token', data.auth_token);
        sessionStorage.setItem('currentUsername', usernameValue);
        localStorage.setItem('currentUsername', usernameValue);
        globalThis.location.href = 'games.html';
      })
      .catch(error => {
        console.error('Login error:', error);
        displayError(error.message || 'Login failed. Please try again.');
      });
  }
  
  if (loginForm) {
    loginForm.addEventListener('submit', login);
    console.log('Form submit handler attached');
  }
  
  if (password) {
    password.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        console.log('Enter key pressed in password field');
        login(e);
      }
    });
    console.log('Password keypress handler attached');
  }
  
  // Make login function available globally for button onclick
  globalThis.login = login;
  globalThis.create_account_page = function() {
    globalThis.location.href = 'create_acount.html';
  };
});