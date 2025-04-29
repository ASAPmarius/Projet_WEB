document.addEventListener('DOMContentLoaded', function() {
    // Verify authentication status
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        globalThis.location.href = 'login.html';
        return;
    }
    
    // Get DOM elements
    const userStatus = document.getElementById('userStatus');
    const gamesLoading = document.getElementById('gamesLoading');
    const gamesList = document.getElementById('gamesList');
    const noGames = document.getElementById('noGames');
    const createGameBtn = document.getElementById('createGameBtn');
    const returnBtn = document.getElementById('returnBtn');
    
    // Initially hide return button until we check if user has a game
    returnBtn.style.display = 'none';
    
    // Current user data
    let currentUser = {
        inGame: false,
        currentGameId: null
    };
    
    // Check if user is already in a game
    checkUserGameStatus();
    
    // Load all active games
    loadGames();
    
    // Event listeners
    createGameBtn.addEventListener('click', createNewGame);
    returnBtn.addEventListener('click', returnToGame);
    
    // Function to check if user is in a game
    async function checkUserGameStatus() {
        try {
            // Instead of relying just on localStorage, check with the server
            const response = await fetch('http://localhost:3000/active-game', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.game && data.game.idGame) {
                    // User has an active game
                    currentUser.inGame = true;
                    currentUser.currentGameId = data.game.idGame;
                    
                    // Update localStorage with the current active game ID
                    localStorage.setItem('currentGameId', data.game.idGame);
                    
                    userStatus.innerHTML = `You are currently in Game #${data.game.idGame}. <a href="#" onclick="returnToGame()">Return to your game</a> or join another.`;
                    returnBtn.style.display = 'block';
                } else {
                    // User doesn't have an active game
                    handleNoActiveGame();
                }
            } else if (response.status === 404) {
                // Handle case where user has no active game
                handleNoActiveGame();
            } else {
                // Handle other API errors
                console.error('Error checking game status:', await response.text());
                userStatus.textContent = 'Unable to check your game status. Please try again later.';
            }
        } catch (error) {
            console.error('Error checking game status:', error);
            userStatus.textContent = 'Unable to check your game status. Please try again later.';
        }
    }
    
    // Handle case where user has no active game
    function handleNoActiveGame() {
        currentUser.inGame = false;
        currentUser.currentGameId = null;
        
        // Clear any stale gameId from localStorage
        localStorage.removeItem('currentGameId');
        
        userStatus.textContent = 'You are not currently in any game. Join one below or create a new game.';
        returnBtn.style.display = 'none';
    }
    
    // Function to load all active games
    async function loadGames() {
        try {
            const response = await fetch('http://localhost:3000/games', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to load games');
            }
            
            const data = await response.json();
            displayGames(data.games);
        } catch (error) {
            console.error('Error loading games:', error);
            gamesLoading.textContent = 'Error loading games. Please try again.';
        }
    }
    
    // Function to display all games
    function displayGames(games) {
        gamesLoading.style.display = 'none';
        
        if (!games || games.length === 0) {
            noGames.style.display = 'block';
            return;
        }
        
        gamesList.style.display = 'grid';
        gamesList.innerHTML = '';
        
        games.forEach(game => {
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            
            const gameDate = new Date(game.DateCreated);
            const formattedDate = gameDate.toLocaleString();
            
            // Check if current user is in this game
            const userInGame = game.players && game.players.some(player => 
                localStorage.getItem('currentUsername') === player.username
            );
            
            let playersList = '';
            if (game.players && game.players.length > 0) {
                playersList = `
                    <div class="players-title">Players (${game.players.length}):</div>
                    ${game.players.map(player => `
                        <div class="player-item">
                            <span>${player.username}</span>
                        </div>
                    `).join('')}
                `;
            } else {
                playersList = '<div class="players-title">No players yet</div>';
            }
            
            gameCard.innerHTML = `
                <div class="game-header">
                    <div class="game-id">Game #${game.idGame}</div>
                    <div class="game-date">${formattedDate}</div>
                </div>
                <div class="game-type">${game.GameType}</div>
                <div class="players-list">
                    ${playersList}
                </div>
                <button class="join-btn" data-game-id="${game.idGame}" ${userInGame ? 'disabled' : ''}>
                    ${userInGame ? 'Already Joined' : 'Join Game'}
                </button>
            `;
            
            gamesList.appendChild(gameCard);
        });
        
        // Add event listeners to join buttons
        document.querySelectorAll('.join-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', function() {
                    const gameId = this.getAttribute('data-game-id');
                    joinGame(gameId);
                });
            }
        });
    }
    
    // Function to create a new game
    async function createNewGame() {
        try {
            // Call the server to create a new game
            const response = await fetch('http://localhost:3000/create-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to create game');
            }
            
            const data = await response.json();
            
            // Store the game ID in local storage
            if (data && data.game && data.game.idGame) {
                localStorage.setItem('currentGameId', data.game.idGame);
                
                // Set the WebSocket flag to prevent disconnection on navigation
                localStorage.setItem('wsWasOpen', 'true');
                
                // Redirect to the game page
                globalThis.location.href = 'index.html';
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Error creating game:', error);
            alert('Failed to create game. Please try again.');
        }
    }
    
    async function joinGame(gameId) {
        try {
            console.log(`Attempting to join game ${gameId}`);
            
            // Find the join button for this game
            const joinButton = document.querySelector(`.join-btn[data-game-id="${gameId}"]`);
            if (joinButton) {
                joinButton.textContent = 'Joining...';
                joinButton.disabled = true;
            }
            
            // First, make sure we're logged in
            const authToken = localStorage.getItem('auth_token');
            if (!authToken) {
                console.error('No auth token found');
                alert('You need to log in first');
                globalThis.location.href = 'login.html';
                return;
            }
            
            // Join the game
            const response = await fetch('http://localhost:3000/join-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ gameId }),
                credentials: 'include'
            });
            
            let responseData;
            try {
                responseData = await response.json();
            } catch (e) {
                console.error('Failed to parse response JSON:', e);
                responseData = {}; // Empty object as fallback
            }
            
            if (!response.ok) {
                console.error('Join game failed:', response.status, responseData);
                throw new Error(responseData.error || 'Failed to join game');
            }
            
            console.log('Join game successful:', responseData);
            
            // Store the game ID in local storage
            localStorage.setItem('currentGameId', gameId);
            
            // Set the WebSocket flag to prevent disconnection on navigation
            localStorage.setItem('wsWasOpen', 'true');
            
            // Show progress in the button
            if (joinButton) {
                joinButton.textContent = 'Redirecting...';
            }
            
            // Use a short delay to improve UX
            setTimeout(() => {
                // Go directly to game page with gameId in URL
                globalThis.location.href = `index.html?gameId=${gameId}`;
            }, 800);
            
        } catch (error) {
            console.error('Error joining game:', error);
            alert('Failed to join game: ' + error.message);
            
            // Reset button state
            const joinButton = document.querySelector(`.join-btn[data-game-id="${gameId}"]`);
            if (joinButton) {
                joinButton.textContent = 'Join Game';
                joinButton.disabled = false;
            }
        }
    }
    
    // Function to return to current game
    async function returnToGame() {
        // Check with server first if the game is still active
        try {
            const response = await fetch('http://localhost:3000/active-game', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.game && data.game.idGame) {
                    // Game is active, redirect to it
                    localStorage.setItem('currentGameId', data.game.idGame);
                    localStorage.setItem('wsWasOpen', 'true');
                    globalThis.location.href = 'index.html';
                } else {
                    // No active game found
                    handleNoActiveGame();
                    alert('You are not currently in an active game.');
                }
            } else if (response.status === 404) {
                // No active game found
                handleNoActiveGame();
                alert('You are not currently in an active game.');
            } else {
                console.error('Error checking active game:', await response.text());
                alert('Unable to check your game status. Please try again later.');
            }
        } catch (error) {
            console.error('Error checking active game:', error);
            alert('Unable to check your game status. Please try again later.');
        }
    }
    
    // Make returnToGame available globally
    globalThis.returnToGame = returnToGame;
});

// Logout function
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('currentUsername');
    localStorage.removeItem('currentGameId');
    localStorage.removeItem('wsWasOpen');
    globalThis.location.href = 'login.html';
}