// Wait for appConfig to be available before checking auth
(function() {
  // Check if appConfig exists, if not, wait for it
  if (typeof appConfig === 'undefined') {
    // Wait for DOM content to be loaded, which ensures all scripts are executed
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof appConfig !== 'undefined') {
        initAuth();
      } else {
        console.error('appConfig is not defined, auth checks will not run');
      }
    });
  } else {
    // appConfig is already available, proceed immediately
    initAuth();
  }

  function initAuth() {
    checkAuthAndRedirect();
    globalThis.addEventListener('beforeunload', handleAuthBeforeUnload);
  }
})();

function handleAuthBeforeUnload(_event) {
  // Check if this is intentional navigation within our app
  if (sessionStorage.getItem('intentionalNavigation') === 'true' || 
      sessionStorage.getItem('wsWasOpen') === 'true') {
    console.log('Intentional navigation detected, skipping disconnect');
    return;
  }
  
  // Only perform disconnect if we're on the game page
  if (globalThis.location.pathname.includes('index.html')) {
    console.log('Unintentional page exit, sending disconnect signal');
    
    try {
      // Send a synchronous request to disconnect from game
      const authToken = localStorage.getItem('auth_token');
      if (authToken) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', appConfig.apiEndpoint('/disconnect-from-game'), false); // false for synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.withCredentials = true;
        xhr.send();
      }
    } catch (error) {
      console.error('Error sending disconnect signal:', error);
    }
  }
}


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

// Replace the verifyTokenWithServer function in auth-check.js
function verifyTokenWithServer(token) {
  // Add a check to see if we're navigating internally
  if (sessionStorage.getItem('intentionalNavigation') === 'true') {
    console.log('Internal navigation detected, skipping token verification');
    // Clear the flag after we've acknowledged it
    sessionStorage.removeItem('intentionalNavigation');
    return; // Skip verification during internal navigation
  }

  // For regular auth checks, use a more reliable approach
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 5000); // 5 second timeout
  
  fetch(appConfig.apiEndpoint('/test_cookie'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include',
    signal: abortController.signal
  })
  .then(response => {
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.log('Token verification failed, status:', response.status);
      // Don't immediately redirect - check if this is a network error first
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
      }
      throw new Error('Token verification failed');
    }
    return response.json();
  })
  .then(data => {
    if (data && data.token_data && data.token_data.userName) {
      console.log('Auth token verified for:', data.token_data.userName);
      // Store username if not already stored
      if (!sessionStorage.getItem('currentUsername')) {
        sessionStorage.setItem('currentUsername', data.token_data.userName);
        // Keep a copy in localStorage as a fallback
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
    clearTimeout(timeoutId);
    console.error('Auth verification error:', error);
    
    // Only redirect to login if it's a real auth error, not just a network error
    // We don't want to log users out if the server is temporarily down
    if (error.message === 'Token verification failed' && 
        !(error.name === 'AbortError' || error.name === 'TypeError')) {
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
    sessionStorage.setItem('currentGameId', gameIdParam);
    return;
  }
  
  // If we already have a gameId in sessionStorage, use that
  const storedGameId = sessionStorage.getItem('currentGameId');
  if (storedGameId) {
    console.log(`Game ID found in sessionStorage: ${storedGameId}, using stored value`);
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
  fetch(appConfig.apiEndpoint('/active-game'), {
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
      sessionStorage.setItem('currentGameId', data.game.idGame);
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