const password = document.getElementById('password');
const errorElement = document.getElementById('error-message');

function displayError(message) {
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  } else {
    console.error(message);
  }
}

function login() {
  event.preventDefault(); // Prevent the default form submission
  console.log('Login function called');

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
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
    body: JSON.stringify({ username: username, password: password })
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
      sessionStorage.setItem('currentUsername', username); // Store username in sessionStorage
      localStorage.setItem('currentUsername', username); // Also store in localStorage as fallback
      globalThis.location.href = 'games.html'; // Redirect to games page instead of index.html
    })
    .catch(error => {
      console.error('Login error:', error);
      displayError(error.message || 'Login failed. Please try again.');
    });
}

// Add listener for Enter key press
if (password) {
  password.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      login();
    }
  });
} else {
  console.warn('Password input element not found');
}

// Function to redirect to account creation page
// deno-lint-ignore no-unused-vars
function create_account_page() {
  globalThis.location.href = 'create_acount.html';
}