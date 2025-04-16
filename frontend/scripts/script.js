const password = document.getElementById('password');

function login() {
  event.preventDefault(); // Prevent the default form submission

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  fetch('http://localhost:3000/login', {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username: username, password: password })
  })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else if (response.status === 401) {
        throw new Error('Invalid credentials.');
      } else {
        throw new Error('The token was not verified.');
      }
    })
    .then(data => {
      localStorage.setItem('auth_token', data.auth_token);
      globalThis.location.href = '../index.html';
    })
    .catch(error => {
      console.error(error);
    });
}

password.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    login();
  }
});

// eslint-disable-next-line no-unused-vars
function create_account_page() {
  globalThis.location.href = '../create_acount.html';
}