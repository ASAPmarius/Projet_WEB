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
        'Content-Type': 'application/json'
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
      redirectToLogin();
    });
  }
  
  // Helper function to check if user has an active game
  function checkActiveGame() {
    fetch('http://localhost:3000/active-game', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        console.log('No active game found, redirecting to games page');
        globalThis.location.href = 'games.html';
        return;
      }
      return response.json();
    })
    .then(data => {
      if (data && data.game && data.game.idGame) {
        // Store game ID in local storage
        localStorage.setItem('currentGameId', data.game.idGame);
        console.log('Active game found:', data.game.idGame);
      }
    })
    .catch(error => {
        console.error('Error checking active game:', error);
        console.error('Request details:', {
        url: 'http://localhost:3000/active-game',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
        });
        // Log the auth token (but don't show the full token in production)
        console.log('Auth token exists:', !!localStorage.getItem('auth_token'));
        
        globalThis.location.href = 'games.html';
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