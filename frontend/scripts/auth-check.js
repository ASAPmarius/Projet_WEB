// auth-check.js - Include this script at the top of games.html and index.html

// Check authentication status immediately when page loads
(function() {
  checkAuthAndRedirect();
})();

// Main function to check authentication and redirect if needed
function checkAuthAndRedirect() {
  const authToken = localStorage.getItem('auth_token');
  
  if (!authToken) {
    console.log('No auth token found, redirecting to login');
    redirectToLogin();
    return;
  }
  
  verifyTokenWithServer(authToken);
}

// Verify token with the server
function verifyTokenWithServer(token) {
  fetch('http://localhost:3000/test_cookie', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      console.log('Token verification failed, status:', response.status);
      redirectToLogin();
      throw new Error('Token verification failed');
    }
    return response.json();
  })
  .then(data => {
    if (data && data.token_data && data.token_data.userName) {
      console.log('Auth token verified for:', data.token_data.userName);
      // Store username if not already stored
      if (!localStorage.getItem('currentUsername')) {
        localStorage.setItem('currentUsername', data.token_data.userName);
      }
      
      // If on game page, check for active game
      if (globalThis.location.pathname.includes('index.html')) {
        checkActiveGame();
      }
    } else {
      console.log('Invalid token data format');
      redirectToLogin();
    }
  })
  .catch(error => {
    console.error('Auth verification error:', error);
    // Only redirect to login if it's a real auth error, not just a network error
    if (error.message === 'Token verification failed') {
      redirectToLogin();
    }
  });
}

function checkActiveGame() {
  // First check URL for gameId parameter
  const urlParams = new URLSearchParams(globalThis.location.search);
  const gameIdParam = urlParams.get('gameId');
  
  // If we have a gameId in the URL, use that and skip the active-game check
  if (gameIdParam) {
    console.log(`Game ID found in URL: ${gameIdParam}, storing and bypassing active-game check`);
    localStorage.setItem('currentGameId', gameIdParam);
    return;
  }
  
  // If we already have a gameId in localStorage, use that
  const storedGameId = localStorage.getItem('currentGameId');
  if (storedGameId) {
    console.log(`Game ID found in localStorage: ${storedGameId}, using stored value`);
    return;
  }
  
  // Otherwise proceed with normal active-game check
  const authToken = localStorage.getItem('auth_token');
  if (!authToken) {
    console.error('No auth token found for active-game check');
    globalThis.location.href = 'login.html';
    return;
  }
  
  console.log('Checking for active game on server...');
  
  // Try both header and cookie authentication
  fetch('http://localhost:3000/active-game', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      console.log(`Active-game check returned status: ${response.status}`);
      
      // Try to parse error details
      return response.json().catch(() => {
        // If we can't parse JSON, just return a generic error
        return { error: 'Failed to check active game' };
      }).then(errorData => {
        console.log('Error details:', errorData);
        
        // Redirect to games page if no active game
        if (response.status === 404) {
          console.log('No active game found, redirecting to games page');
          globalThis.location.href = 'games.html';
        }
        
        return null;
      });
    }
    return response.json();
  })
  .then(data => {
    if (data && data.game && data.game.idGame) {
      localStorage.setItem('currentGameId', data.game.idGame);
      console.log('Active game found and stored:', data.game.idGame);
    }
  })
  .catch(error => {
    console.error('Error checking active game:', error);
    // Show error but don't redirect
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.textContent = 'Error connecting to game server. Please refresh the page.';
    document.body.appendChild(errorDiv);
  });
}

// Helper function to redirect to login page
function redirectToLogin() {
  localStorage.removeItem('auth_token');
  globalThis.location.href = 'login.html';
}

// Export functions for global use if needed
globalThis.checkAuthAndRedirect = checkAuthAndRedirect;
globalThis.checkActiveGame = checkActiveGame;