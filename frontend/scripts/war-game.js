// war-game.js - Implementation of the War card game using the CardGameFramework

class WarGame extends CardGameFramework {
    constructor() {
      // Initialize with game-specific settings
      super({
        maxPlayers: 2, // War is typically played with 2 players
        startingHandSize: 26, // Half the deck per player
        winCondition: 'all-cards', // Win by collecting all cards
        allowedActions: ['play'] // Only play action needed in War
      });
      
      // Game-specific state
      this.currentRound = 0;
      this.roundCards = []; // Cards played in the current round
      this.warMode = false; // Whether we're in a war
      this.warPile = []; // Cards in the war pile
      
      // Bind methods
      this.playTopCard = this.playTopCard.bind(this);
      this.compareCards = this.compareCards.bind(this);
      this.resolveRound = this.resolveRound.bind(this);
      this.startWar = this.startWar.bind(this);
      this.updateScoreboard = this.updateScoreboard.bind(this);
    }
    
    // Extend the init method from the parent class
    async init() {
      console.log("=== WAR GAME INIT START ===");
      console.log(`Game ID before super.init(): ${this.currentGameId}`);
      
      await super.init();
      
      console.log(`Game ID after super.init(): ${this.currentGameId}`);
      console.log(`localStorage currentGameId: ${localStorage.getItem('currentGameId')}`);
      
      // Add war-specific UI elements
      this.createWarTable();
      this.createScoreboard();
      
      // Add event listener for the play button
      this.addPlayButtonListener();
      
      // Log game state for debugging
      console.log("=== WAR GAME DEBUG INFO ===");
      console.log("Current Game State:", this.gameState);
      console.log("Game ID:", this.currentGameId);
      console.log("Players:", this.players);
    }
    
    // Create the war-specific table layout
    createWarTable() {
      // Create battle area in the center of the table
      const tableCenter = document.querySelector('.table-center');
      if (!tableCenter) return;
      
      // Create battle area container
      const battleArea = document.createElement('div');
      battleArea.className = 'war-battle-area';
      battleArea.id = 'battleArea';
      
      // Create player 1 card slot
      const player1Slot = document.createElement('div');
      player1Slot.className = 'war-card-slot player1-slot';
      player1Slot.id = 'player1Slot';
      
      // Create VS indicator
      const vsIndicator = document.createElement('div');
      vsIndicator.className = 'war-vs-indicator';
      vsIndicator.textContent = 'VS';
      
      // Create player 2 card slot
      const player2Slot = document.createElement('div');
      player2Slot.className = 'war-card-slot player2-slot';
      player2Slot.id = 'player2Slot';
      
      // Create action button
      const actionButton = document.createElement('button');
      actionButton.className = 'war-action-button';
      actionButton.id = 'warActionButton';
      actionButton.textContent = 'Play Cards';
      
      // Create result indicator
      const resultIndicator = document.createElement('div');
      resultIndicator.className = 'war-result-indicator';
      resultIndicator.id = 'warResult';
      
      // Assemble battle area
      battleArea.appendChild(player1Slot);
      battleArea.appendChild(vsIndicator);
      battleArea.appendChild(player2Slot);
      battleArea.appendChild(document.createElement('br'));
      battleArea.appendChild(actionButton);
      battleArea.appendChild(resultIndicator);
      
      // Add to the table center
      tableCenter.appendChild(battleArea);
    }
    
    // Create a scoreboard to track card counts
    createScoreboard() {
      const scoreboard = document.createElement('div');
      scoreboard.className = 'war-scoreboard';
      scoreboard.id = 'warScoreboard';
      
      // Create title
      const title = document.createElement('h3');
      title.textContent = 'Card Count';
      scoreboard.appendChild(title);
      
      // Create score container
      const scoreContainer = document.createElement('div');
      scoreContainer.className = 'war-scores';
      scoreContainer.id = 'warScores';
      scoreboard.appendChild(scoreContainer);
      
      // Add the scoreboard to the page
      document.body.appendChild(scoreboard);
    }
    
    // Add listener for the play button
    addPlayButtonListener() {
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.addEventListener('click', () => {
          // Only allow playing if it's the current player's turn or if turn system is off
          if (this.isMyTurn()) {
            this.playTopCard();
          } else {
            this.showNotification("It's not your turn to play");
          }
        });
      }
    }

    // Add this new method to the WarGame class
    findPlayerById(playerId) {
      if (!this.players || !this.players.length) {
        console.warn('No players array available when trying to find player');
        return null;
      }
      
      // Try to find the player using various ID formats
      let player = this.players.find(p => p.id === playerId);
      
      // If not found by direct comparison, try numeric comparison
      if (!player) {
        player = this.players.find(p => Number(p.id) === Number(playerId));
      }
      
      // If still not found, try string comparison
      if (!player) {
        player = this.players.find(p => String(p.id) === String(playerId));
      }
      
      // If still not found, try position-based fallback (WAR specific, assumes 2 players)
      if (!player && this.players.length === 2) {
        // In WAR game, if ID is 2, it might be player at index 1
        if ((playerId === 2 || playerId === '2') && this.players[1]) {
          console.log('Using position-based player lookup as fallback');
          return this.players[1];
        }
        // If ID is 1, it might be player at index 0
        if ((playerId === 1 || playerId === '1') && this.players[0]) {
          console.log('Using position-based player lookup as fallback');
          return this.players[0];
        }
      }
      
      return player;
    }
    
    isMyTurn() {
      // If game is in war mode, let the player who started the war play
      if (this.warMode) {
        return true;
      }
      
      // Check if turn-based system is being used
      if (this.gameState && this.gameState.currentTurn) {
        const turnId = this.gameState.currentTurn;
        
        // If we don't have a currentPlayerId, try to match by username
        if (!this.currentPlayerId) {
          // Find player with the current turn ID
          const turnPlayer = this.findPlayerById(turnId);
          // Check if this is the current player by username
          return turnPlayer && turnPlayer.username === this.currentUsername;
        }
        
        // Otherwise do normal ID comparison
        return turnId === this.currentPlayerId || 
               Number(turnId) === this.currentPlayerIdAsNumber ||
               String(turnId) === this.currentPlayerIdAsString;
      }
      
      // If no turn system, always allow playing
      return true;
    }
    
    // Play the top card from the player's hand
    playTopCard() {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        console.warn('Cannot play card - WebSocket not connected');
        return;
      }
      
      // Disable the button while processing
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.disabled = true;
        actionButton.textContent = 'Processing...';
      }
      
      if (this.warMode) {
        // In war mode, play 4 cards (3 face down, 1 face up)
        this.websocket.send(JSON.stringify({
          auth_token: localStorage.auth_token,
          type: 'war_play_cards',
          gameId: this.currentGameId,
          count: 4
        }));
      } else {
        // Normal play - just 1 card
        this.websocket.send(JSON.stringify({
          auth_token: localStorage.auth_token,
          type: 'play_top_card',
          gameId: this.currentGameId
        }));
      }
    }
    
    // Compare two cards to determine the winner
    compareCards(card1, card2) {
      if (!card1 || !card2 || !card1.cardType || !card2.cardType) {
        console.error('Invalid cards for comparison:', card1, card2);
        return 0; // Default to war if we can't compare
      }
      // Convert card types to ranks (assuming card types 1-13 for each suit)
      const getRank = (cardType) => {
        // Get the card rank (1-13) from the card type
        return ((cardType - 1) % 13) + 1;
      };
      
      const rank1 = getRank(card1.cardType);
      const rank2 = getRank(card2.cardType);
      
      if (rank1 > rank2) return 1; // Player 1 wins
      if (rank1 < rank2) return 2; // Player 2 wins
      return 0; // Tie - war!
    }
    
    // Resolve the current round
    resolveRound(cards) {
      // Update UI with played cards
      this.updateCardSlots(cards);
      
      // If we don't have all the cards needed yet, wait
      if (cards.length < 2) {
        return;
      }
      
      // Compare the cards to determine winner
      const result = this.compareCards(cards[0], cards[1]);
      
      // Update result indicator
      const resultIndicator = document.getElementById('warResult');
      
      if (result === 0) {
        // It's a war!
        if (resultIndicator) {
          resultIndicator.textContent = "It's a WAR!";
          resultIndicator.className = 'war-result-indicator war';
        }
        
        // Start war procedure
        this.startWar(cards);
      } else {
        // We have a winner
        const winnerName = result === 1 ? this.players[0].username : this.players[1].username;
        
        if (resultIndicator) {
          resultIndicator.textContent = `${winnerName} wins the round!`;
          resultIndicator.className = 'war-result-indicator winner';
        }
        
        // Send the result to the server
        this.sendRoundResult(result, cards);
      }
    }
    
    // Start the war procedure
    startWar(cards) {
      // Set war mode
      this.warMode = true;
      
      // Add cards to war pile
      this.warPile = [...this.warPile, ...cards];
      
      // Update action button
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = 'Play War Cards';
      }
      
      // Show war notification
      this.showNotification("WAR! Each player draws 4 more cards", "war");
    }
    
    // Update the card slots in the UI
    updateCardSlots(cards) {
      // Get the slot elements
      const player1Slot = document.getElementById('player1Slot');
      const player2Slot = document.getElementById('player2Slot');
      
      // Clear the slots
      if (player1Slot) player1Slot.innerHTML = '';
      if (player2Slot) player2Slot.innerHTML = '';
      
      // Add cards to slots
      if (cards.length > 0 && player1Slot) {
        const cardImg = document.createElement('img');
        cardImg.src = cards[0].picture;
        cardImg.alt = 'Player 1 Card';
        cardImg.className = 'war-card-image';
        player1Slot.appendChild(cardImg);
      }
      
      if (cards.length > 1 && player2Slot) {
        const cardImg = document.createElement('img');
        cardImg.src = cards[1].picture;
        cardImg.alt = 'Player 2 Card';
        cardImg.className = 'war-card-image';
        player2Slot.appendChild(cardImg);
      }
    }
    
    // Send the round result to the server
    sendRoundResult(winner, cards) {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        console.warn('Cannot send result - WebSocket not connected');
        return;
      }
      
      // Calculate all cards to give to the winner (including war pile)
      const allCards = [...this.warPile, ...cards];
      this.warPile = []; // Clear war pile
      
      // Reset war mode
      this.warMode = false;
      
      // Update action button
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = 'Play Cards';
      }
      
      // Send the result
      this.websocket.send(JSON.stringify({
        auth_token: localStorage.auth_token,
        type: 'war_round_result',
        gameId: this.currentGameId,
        winner: winner, // 1 or 2 indicating player number
        cards: allCards.map(card => card.idCard)
      }));
      
      // Increment round counter
      this.currentRound++;
      
      // Check for game end conditions
      this.checkGameEnd();
    }
    
    // Check if the game has ended
    checkGameEnd() {
      if (!this.players || this.players.length < 2) {
        console.warn('Not enough players to check game end');
        return;
      }
      // Check if any player has 0 cards
      const player1Cards = this.players[0].cardCount || 0;
      const player2Cards = this.players[1].cardCount || 0;
      
      if (player1Cards === 0 || player2Cards === 0) {
        // Game has ended
        const winner = player1Cards > 0 ? this.players[0].username : this.players[1].username;
        
        // Show game over notification
        this.showNotification(`Game Over! ${winner} wins the game!`, "gameOver");
        
        // Finish the game
        this.finishGame();
      }
    }
    
    // Update the scoreboard with current card counts
    updateScoreboard() {
      const scoreContainer = document.getElementById('warScores');
      if (!scoreContainer || !this.players || this.players.length < 2) return;
      
      // Clear current scores
      scoreContainer.innerHTML = '';
      
      // Add player 1 score
      const player1Score = document.createElement('div');
      player1Score.className = 'war-player-score';
      player1Score.innerHTML = `
        <span class="war-player-name">${this.players[0].username}:</span>
        <span class="war-card-count">${this.players[0].cardCount || 0} cards</span>
      `;
      scoreContainer.appendChild(player1Score);
      
      // Add player 2 score
      const player2Score = document.createElement('div');
      player2Score.className = 'war-player-score';
      player2Score.innerHTML = `
        <span class="war-player-name">${this.players[1].username}:</span>
        <span class="war-card-count">${this.players[1].cardCount || 0} cards</span>
      `;
      scoreContainer.appendChild(player2Score);
      
      // Add round counter
      const roundCounter = document.createElement('div');
      roundCounter.className = 'war-round-counter';
      roundCounter.textContent = `Round: ${this.currentRound}`;
      scoreContainer.appendChild(roundCounter);
    }
    
    // Override the handlePlayerHandUpdate method
    handlePlayerHandUpdate(data) {
      // Call the parent method first
      super.handlePlayerHandUpdate(data);
      
      // Then update our scoreboard
      this.updateScoreboard();
    }
    
    // Add handler for war-specific message types
    handleWebSocketMessage(event) {
      try {
        const data = JSON.parse(event.data);
        console.log('War game received message type:', data.type);
        
        // Handle war-specific messages
        if (data.type === 'war_cards_played') {
          this.resolveRound(data.cards);
          return;
        }
        
        // For debugging connected_users and game_state
        if (data.type === 'connected_users') {
          console.log('War game received connected_users:', data.users);
        }
        
        if (data.type === 'game_state') {
          console.log('War game received game_state:', data.gameState);
        }
        
        // Call the parent handler for other message types
        super.handleWebSocketMessage(event);
      } catch (error) {
        console.error('Error handling WebSocket message in WarGame:', error);
      }
    }

    handleConnectedUsers(data) {
      // First call the parent implementation
      super.handleConnectedUsers(data);

      this.updateScoreboard();
      
      // Then call our custom implementation
      this.handleConnectedUsersWar(data);
    }

    handleConnectedUsersWar(data) {
      if (data.users && Array.isArray(data.users)) {
        console.log('Raw user data received:', data.users);
        
        // Assign IDs manually if they don't exist from the backend
        this.players = data.users.map((user, index) => ({
          id: user.id || (index + 1), // Use ID from server or position-based ID
          idAsNumber: user.id ? Number(user.id) : (index + 1),
          idAsString: user.id ? String(user.id) : String(index + 1),
          username: user.username,
          pp_path: user.pp_path,
          cardCount: user.cardCount || 0
        }));
        
        console.log('Updated players array with position-based IDs:', this.players);
        
        // Find current player by username and assign IDs
        const currentPlayer = this.players.find(p => p.username === this.currentUsername);
        if (currentPlayer) {
          this.currentPlayerId = currentPlayer.id;
          this.currentPlayerIdAsNumber = Number(currentPlayer.id);
          this.currentPlayerIdAsString = String(currentPlayer.id);
          console.log(`Current player (${this.currentUsername}) has ID: ${this.currentPlayerId}`);
        } else {
          console.warn(`Could not find current player in players array: ${this.currentUsername}`);
        }
      }
      
      // Update the scoreboard with player information
      this.updateScoreboard();
    }
  }
  
  // Initialize the War game
  globalThis.addEventListener('DOMContentLoaded', () => {
    // Create the game instance
    globalThis.warGame = new WarGame();
    
    // Expose functions for HTML onclick handlers
    globalThis.playWarCards = function() {
      if (globalThis.warGame) {
        globalThis.warGame.playTopCard();
      }
    };
  });