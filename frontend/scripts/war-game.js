// war-game.js - War Card Game Implementation
//IMPORTANT : current-player IS "you" AND active-player IS  whose turn it is currently
class WarGame extends CardGameFramework {
  constructor() {
    // Initialize with game-specific settings
    super({
      maxPlayers: 2,
      startingHandSize: 26,
      winCondition: 'all-cards',
      allowedActions: ['play']
    });
    
    // War-specific properties
    this.warMode = false;
    this.playedCards = {};
    this.faceDownCardSlots = {};
    this.skipNextHighlightUpdate = false;
    this.uiInitialized = false;
    
    // Create scoreboard when game is initialized
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('warScoreboard')) {
        this.createScoreboard();
      }
    });
    
    // Listen for game state changes
    document.addEventListener('gameStateChanged', () => {
      if (this.gameState && this.gameState.phase === 'playing' && !this.uiInitialized) {
        this.initializeWarUI();
      }
    });
  }
  
  // Initialize War-specific UI elements
  initializeWarUI() {
    console.log('Initializing War UI');
    // Force create card stacks regardless of previous state
    this.createPlayerCardStacks();
    this.updateCardStackCounts();
    this.updateCardStackState();
    
    // Flag that UI is initialized
    this.uiInitialized = true;
    
    // Force update game state to ensure turn is properly set
    this.sendWebSocketMessage({ 
      type: 'game_state_request', 
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
  }
  
  // Override the animateCardToPosition method for War-specific card animations
  animateCardToPosition(animatedCard, card, _isWarCard, isOpponent) {
    setTimeout(() => {
      // Use the same animation logic for all cards, regardless of war status
      if (isOpponent) {
        // Opponent's card destination - player1 slot
        const slot = document.getElementById('player1Slot');
        if (slot) {
          const rect = slot.getBoundingClientRect();
          animatedCard.style.top = `${rect.top}px`;
          animatedCard.style.left = `${rect.left + rect.width/2}px`;
        } else {
          // Fallback if slot not found
          animatedCard.style.top = 'calc(50% - 150px)';
        }
      } else {
        // Player's card destination - player2 slot
        const slot = document.getElementById('player2Slot');
        if (slot) {
          const rect = slot.getBoundingClientRect();
          animatedCard.style.bottom = `${globalThis.innerHeight - rect.bottom}px`;
          animatedCard.style.left = `${rect.left + rect.width/2}px`;
        } else {
          // Fallback if slot not found
          animatedCard.style.bottom = 'calc(50% - 150px)';
        }
      }
      
      // Only display the card in the slot AFTER animation completes
      setTimeout(() => {
        // Update the slot with the final card
        const slotId = isOpponent ? 'player1Slot' : 'player2Slot';
        const slot = document.getElementById(slotId);
        if (slot) {
          slot.innerHTML = '';
          const finalCardImg = document.createElement('img');
          finalCardImg.src = card.picture;
          finalCardImg.alt = `${card.rank} of ${card.suit}`;
          finalCardImg.className = 'war-card-image';
          slot.appendChild(finalCardImg);
        }
        
        // Remove the animated element
        animatedCard.remove();
      }, 500); // Use consistent timing for all cards
    }, 10);
  }
  
  // War-specific method to handle War card play
  handleWarCardAction(playerId, username, cardId) {
    console.log(`Player ${username} played war card ${cardId}`);
    
    // Get the card data
    const card = this.cardsById[cardId];
    if (!card) {
      console.warn(`Card data not found for ID ${cardId}`);
      return;
    }
    
    // Check if there was a face-down card in this slot
    if (this.faceDownCardSlots && this.faceDownCardSlots[playerId]) {
      // Explicitly clear the slot before updating it
      const slotId = String(playerId) === String(this.currentPlayerId) ? 'player2Slot' : 'player1Slot';
      const slot = document.getElementById(slotId);
      if (slot) {
        slot.innerHTML = '';
      }
      // Mark as cleared
      delete this.faceDownCardSlots[playerId];
    }
    
    // Update the card slot
    this.updateCardSlot(playerId, card);
    
    // Animate the card play with more dramatic effect for war
    const isOpponent = String(playerId) !== String(this.currentPlayerId);
    this.animateCardPlay(card, false, isOpponent); // Pass true to indicate war card
    
    // Show notification
    this.showNotification(`${username} played a war card!`, 'war-card');
  }
  
  // War-specific methods to update card display
  updateCardSlot(playerId, card) {
    let slot;
    
    if (String(playerId) === String(this.currentPlayerId)) {
      slot = document.getElementById('player2Slot');
    } else {
      slot = document.getElementById('player1Slot');
    }
    
    if (!slot) {
      console.warn(`Card slot not found for player ${playerId}`);
      return;
    }
    
    slot.innerHTML = '';
    
    // Always get full card data with picture from our cardsById cache
    const fullCardData = this.cardsById[card.id] || card;    
    const cardImage = document.createElement('img');
    cardImage.src = fullCardData.picture;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardImage.className = 'war-card-image';
    
    slot.appendChild(cardImage);
  }

  clearCardSlots() {
    const player1Slot = document.getElementById('player1Slot');
    const player2Slot = document.getElementById('player2Slot');
    
    if (player1Slot) player1Slot.innerHTML = '';
    if (player2Slot) player2Slot.innerHTML = '';
  }
  
  clearTable() {
    this.clearCardSlots();
    this.playedCards = {};
  }
  
  // War-specific methods for poker table
  initPokerTable() {
    super.initPokerTable();
    
    const pokerTable = document.querySelector('.poker-table-container');
    
    if (!pokerTable) {
      const table = document.createElement('div');
      table.className = 'poker-table-container';
      document.body.appendChild(table);
      this.uiElements.pokerTable = table;
      this.createBattleArea();
    } else {
      this.uiElements.pokerTable = pokerTable;
      this.createBattleArea();
    }
  }
  
  createPlayerCardStacks() {
    console.log('Creating player card stacks');
    
    // First remove any existing stacks to avoid duplicates
    const existingStacks = document.querySelectorAll('.war-card-stack');
    existingStacks.forEach(stack => stack.remove());
    
    // Get card back image (with fallback)
    const cardBackImage = this.cardsById && this.cardsById[54] ? 
      this.cardsById[54].picture : 'card_back.png';
    
    // Create player card stack (always your stack at the bottom)
    const playerStack = document.createElement('div');
    playerStack.id = 'playerCardStack';
    playerStack.className = 'war-card-stack player-stack';
    
    // Add face down card image
    const playerCardImage = document.createElement('img');
    playerCardImage.src = cardBackImage;
    playerCardImage.alt = 'Your cards';
    playerCardImage.className = 'stack-card-image';
    
    // Add card count indicator
    const playerCardCount = document.createElement('div');
    playerCardCount.className = 'stack-card-count';
    playerCardCount.id = 'playerCardCount';
    playerCardCount.textContent = '0';
    
    playerStack.appendChild(playerCardImage);
    playerStack.appendChild(playerCardCount);
    
    // Add click handler with proper binding
    const boundPlayTopCard = this.playTopCard.bind(this);
    playerStack.addEventListener('click', boundPlayTopCard);
    
    // Create opponent card stack
    const opponentStack = document.createElement('div');
    opponentStack.id = 'opponentCardStack';
    opponentStack.className = 'war-card-stack opponent-stack';
    
    // Add face down card image
    const opponentCardImage = document.createElement('img');
    opponentCardImage.src = cardBackImage;
    opponentCardImage.alt = 'Opponent cards';
    opponentCardImage.className = 'stack-card-image';
    
    // Add card count indicator
    const opponentCardCount = document.createElement('div');
    opponentCardCount.className = 'stack-card-count';
    opponentCardCount.id = 'opponentCardCount';
    opponentCardCount.textContent = '0';
    
    opponentStack.appendChild(opponentCardImage);
    opponentStack.appendChild(opponentCardCount);
    
    // Add to the table
    if (this.uiElements.pokerTable) {
      this.uiElements.pokerTable.appendChild(playerStack);
      this.uiElements.pokerTable.appendChild(opponentStack);
      console.log('Card stacks added to poker table');
    } else {
      console.warn('Poker table element not found, adding to body instead');
      document.body.appendChild(playerStack);
      document.body.appendChild(opponentStack);
    }
    
    // Force update counts immediately
    this.updateCardStackCounts();
    
    // Force update visual state
    this.updateCardStackState();
  }
  
  playTopCard() {
    console.log('playTopCard called - checking turn state');
    
    if (!this.isMyTurn()) {
      console.log('Not my turn, current turn: ' + this.gameState.currentTurn + 
                  ', my ID: ' + this.currentPlayerId);
      this.showNotification("It's not your turn to play");
      return;
    }
    
    // Get the player's hand
    const playerHand = this.hands[this.currentPlayerId];
    if (!playerHand || playerHand.length === 0) {
      console.log('No cards in hand');
      this.showNotification("You don't have any cards to play");
      return;
    }
    
    // Get the top card (first in the array)
    const topCard = playerHand[0];
    console.log('Playing top card with ID: ' + topCard.id);
    
    // Play the card through the existing system
    this.playCard(topCard.id);
    
    // Visual feedback for click
    const playerStack = document.getElementById('playerCardStack');
    if (playerStack) {
      playerStack.classList.add('clicked');
      
      // Remove the class after animation completes
      setTimeout(() => {
        playerStack.classList.remove('clicked');
      }, 300);
    }
  }
  
  // Override the updateHandDisplay method to also update the card stacks
  updateHandDisplay() {
    // First call the parent method to keep its functionality
    super.updateHandDisplay();
    
    // Make sure card stacks exist
    if (!document.getElementById('playerCardStack') && this.gameState && this.gameState.phase === 'playing') {
      this.createPlayerCardStacks();
    }
    
    // Update card stack counts
    this.updateCardStackCounts();
    
    // Update visual state of card stacks based on whose turn it is
    this.updateCardStackState();
  }
  
  // Dispatch a custom event when game state changes
  handleGameState(data) {
    // Call the parent method first
    super.handleGameState(data);
    
    // Dispatch custom event for phase change
    if (this.gameState && this.gameState.phase === 'playing') {
      if (!this.uiInitialized) {
        console.log('Game phase changed to playing, initializing UI');
        document.dispatchEvent(new CustomEvent('gameStateChanged'));
        this.initializeWarUI(); // Direct call in addition to event
      } else {
        console.log('Game phase is playing, UI already initialized');
        // Even if UI is initialized, make sure card stacks exist
        if (!document.getElementById('playerCardStack')) {
          console.log('Card stacks missing, creating them');
          this.createPlayerCardStacks();
        }
      }
      
      // NEW CODE: Update player UI with current hands data
      // This ensures mini cards are displayed once hands data is available
      if (this.players && this.players.length >= 2 && Object.keys(this.hands).length > 0) {
        console.log('Hands data received, updating player UI with mini cards');
        this.updateTablePlayersWar(this.players, this.currentUsername);
      }
    }
    
    // Always update card stacks if they exist
    setTimeout(() => {
      if (document.getElementById('playerCardStack')) {
        console.log('Updating card stack counts and state');
        this.updateCardStackCounts();
        this.updateCardStackState();
      } else if (this.gameState && this.gameState.phase === 'playing') {
        console.log('Card stacks should exist but don\'t, creating them');
        this.createPlayerCardStacks();
      }
    }, 100); // Short delay to ensure DOM is updated
  }
  
  // NEW METHOD: Update card stack counts
  updateCardStackCounts() {
    // Find both players
    if (!this.players || this.players.length < 2) return;
    
    let currentPlayer = null;
    let opponent = null;
    
    // Find the current player and opponent
    for (const player of this.players) {
      if (String(player.id) === String(this.currentPlayerId)) {
        currentPlayer = player;
      } else {
        opponent = player;
      }
    }
    
    if (!currentPlayer || !opponent) {
      console.warn('Could not identify players for updating card stacks');
      return;
    }
    
    // Update player stack count
    const playerCount = document.getElementById('playerCardCount');
    const playerStack = document.getElementById('playerCardStack');
    
    if (playerCount && playerStack && currentPlayer) {
      const handSize = this.hands[currentPlayer.id] ? this.hands[currentPlayer.id].length : 0;
      playerCount.textContent = handSize;
      
      // Hide stack if no cards
      playerStack.style.visibility = handSize > 0 ? 'visible' : 'hidden';
    }
    
    // Update opponent stack count
    const opponentCount = document.getElementById('opponentCardCount');
    const opponentStack = document.getElementById('opponentCardStack');
    
    if (opponentCount && opponentStack && opponent) {
      const handSize = this.hands[opponent.id] ? this.hands[opponent.id].length : 0;
      opponentCount.textContent = handSize;
      
      // Hide stack if no cards
      opponentStack.style.visibility = handSize > 0 ? 'visible' : 'hidden';
    }
  }
  
  updateCardStackState() {
    const playerStack = document.getElementById('playerCardStack');
    const opponentStack = document.getElementById('opponentCardStack');
    
    if (!playerStack || !opponentStack) {
      console.log('Card stacks not found, deferring update');
      // If stacks don't exist yet, try to create them
      if (this.gameState && this.gameState.phase === 'playing') {
        setTimeout(() => {
          if (!document.getElementById('playerCardStack')) {
            console.log('Creating card stacks during deferred update');
            this.createPlayerCardStacks();
          }
        }, 300);
      }
      return;
    }
    
    // Check whose turn it is
    const isMyTurn = this.isMyTurn();
    console.log('Updating card stack state, my turn: ' + isMyTurn);
    
    // Update player stack - highlight if it's their turn
    if (isMyTurn) {
      playerStack.classList.add('my-turn');
      playerStack.style.cursor = 'pointer';
      console.log('Added my-turn class to player stack');
    } else {
      playerStack.classList.remove('my-turn');
      playerStack.style.cursor = 'default';
    }
    
    // Update opponent stack - highlight if it's their turn
    const opponentTurn = this.gameState.currentTurn && 
                        this.players.some(p => 
                          String(p.id) === String(this.gameState.currentTurn) && 
                          String(p.id) !== String(this.currentPlayerId));
    
    if (opponentTurn) {
      opponentStack.classList.add('opponent-turn');
    } else {
      opponentStack.classList.remove('opponent-turn');
    }
  }
  
  createBattleArea() {
    if (!this.uiElements.pokerTable) return;
    
    const battleArea = document.createElement('div');
    battleArea.className = 'war-battle-area';
    battleArea.id = 'battleArea';
    
    const player1Slot = document.createElement('div');
    player1Slot.className = 'war-card-slot player1-slot';
    player1Slot.id = 'player1Slot';
    
    const vsIndicator = document.createElement('div');
    vsIndicator.className = 'war-vs-indicator';
    vsIndicator.textContent = 'VS';
    
    const player2Slot = document.createElement('div');
    player2Slot.className = 'war-card-slot player2-slot';
    player2Slot.id = 'player2Slot';
    
    const resultIndicator = document.createElement('div');
    resultIndicator.className = 'war-result-indicator'; // Initially without show class
    resultIndicator.id = 'warResult';
    resultIndicator.textContent = ''; // Start with empty text
    
    battleArea.appendChild(player1Slot);
    battleArea.appendChild(vsIndicator);
    battleArea.appendChild(player2Slot);
    battleArea.appendChild(document.createElement('br'));
    battleArea.appendChild(resultIndicator);
    
    this.uiElements.pokerTable.appendChild(battleArea);
  }
  
  createScoreboard() {
    const scoreboard = document.createElement('div');
    scoreboard.className = 'war-scoreboard';
    scoreboard.id = 'warScoreboard';
    
    const title = document.createElement('h3');
    title.textContent = 'Card Count';
    scoreboard.appendChild(title);
    
    const scoreContainer = document.createElement('div');
    scoreContainer.className = 'war-scores';
    scoreContainer.id = 'warScores';
    scoreboard.appendChild(scoreContainer);
    
    const roundCounter = document.createElement('div');
    roundCounter.className = 'war-round-counter';
    roundCounter.id = 'warRoundCounter';
    roundCounter.textContent = 'Round: 1';
    scoreboard.appendChild(roundCounter);
    
    document.body.appendChild(scoreboard);
  }
  
  updateScoreboard() {
    const scoreContainer = document.getElementById('warScores');
    const roundCounter = document.getElementById('warRoundCounter');
    
    if (!scoreContainer || !this.players || this.players.length < 2) return;
    
    scoreContainer.innerHTML = '';
    
    this.players.forEach(player => {
      const handSize = this.hands[player.id] ? this.hands[player.id].length : 0;
      
      const playerScore = document.createElement('div');
      playerScore.className = 'war-player-score';
      playerScore.innerHTML = `
        <span class="war-player-name">${player.username}:</span>
        <span class="war-card-count">${handSize} cards</span>
      `;
      
      scoreContainer.appendChild(playerScore);
    });
    
    if (roundCounter) {
      roundCounter.textContent = `Round: ${this.gameState.round || 1}`;
    }
    
    // Also update card stack counts if they exist
    if (document.getElementById('playerCardStack')) {
      this.updateCardStackCounts();
    }
  }
  
  // Modified to use WebSocket message only
  playCard(cardId) {
    if (!this.isMyTurn()) {
      this.showNotification("It's not your turn to play");
      return;
    }
    
    // Send play_card action to server - the server will handle all game logic
    this.sendWebSocketMessage({
      type: 'player_action',
      action: {
        type: 'play_card',
        cardId: cardId
      },
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
  }
  
  highlightCurrentPlayer(playerId) {
    console.log('WarGame highlighting player:', playerId);
    
    // Clear ALL highlighting classes first
    const playerSeats = document.querySelectorAll('.player-seat');
    playerSeats.forEach(seat => {
      seat.classList.remove('active-player');
    });
    
    // Only highlight the player whose turn it is
    const player = this.players.find(p => String(p.id) === String(playerId));
    if (!player) return;
    
    const seat = document.getElementById(`player-seat-${player.username}`);
    if (seat) {
      seat.classList.add('active-player');
    }
    
    // Update card stack highlighting if stacks exist
    if (document.getElementById('playerCardStack')) {
      this.updateCardStackState();
    }
    
    console.log(`Applied active-player class to seat for ${player.username}`);
  }
  
  updateTablePlayersWar(players, currentUsername) {
    if (!this.uiElements.pokerTable) {
      console.warn('Poker table not initialized');
      return;
    }
  
    // Remove existing seats
    const existingSeats = document.querySelectorAll('.player-seat');
    existingSeats.forEach(seat => seat.remove());
    
    // Create a sorted array where current player is always second (index 1)
    const sortedPlayers = [...players.slice(0, 2)].sort((a, b) => {
      if (a.username === currentUsername) return 1;
      if (b.username === currentUsername) return -1;
      return 0;
    });
    
    // Define consistent fixed positions - using position classes rather than inline styles
    const positions = ['top-player', 'bottom-player'];
    
    sortedPlayers.forEach((player, index) => {
      const seat = document.createElement('div');
      seat.className = `player-seat ${positions[index]}`;
      seat.id = `player-seat-${player.username}`;
      
      if (player.username === currentUsername) {
        seat.classList.add('current-player');
      }
      
      // Apply active player class if needed
      if (this.gameState && Number(this.gameState.currentTurn) === Number(player.id)) {
        seat.classList.add('active-player');
      }
      
      // Add this check for the connected status
      if (player.connected === false) {
        seat.classList.add('disconnected');
      }
      
      const playerInfo = document.createElement('div');
      playerInfo.className = 'player-info';
      
      const avatar = document.createElement('img');
      avatar.className = 'player-avatar';
      avatar.src = player.pp_path || 'profile_pictures/default.jpg';
      avatar.alt = player.username;
      
      const details = document.createElement('div');
      details.className = 'player-details';
      
      const name = document.createElement('div');
      name.className = 'player-name';
      name.textContent = player.username;
      
      const cardCount = document.createElement('div');
      cardCount.className = 'player-cards';
      
      const handSize = this.hands[player.id] ? this.hands[player.id].length : 0;
      
      // Limit number of mini cards displayed to prevent layout issues
      const maxMiniCards = 3;
      for (let i = 0; i < Math.min(maxMiniCards, handSize); i++) {
        const miniCard = document.createElement('div');
        miniCard.className = 'card-mini';
        cardCount.appendChild(miniCard);
      }
      
      if (handSize > 0) {
        const count = document.createElement('span');
        count.className = 'cards-count';
        count.textContent = handSize;
        cardCount.appendChild(count);
      }
      
      details.appendChild(name);
      details.appendChild(cardCount);
      playerInfo.appendChild(avatar);
      playerInfo.appendChild(details);
      seat.appendChild(playerInfo);
      
      this.uiElements.pokerTable.appendChild(seat);
    });
    
    this.updateScoreboard();
    
    // If game is in playing phase and UI not yet initialized, create card stacks
    if (this.gameState && this.gameState.phase === 'playing') {
      if (!this.uiInitialized) {
        this.initializeWarUI();
      } else if (!document.getElementById('playerCardStack')) {
        // If stacks don't exist but should, create them
        this.createPlayerCardStacks();
        this.updateCardStackCounts();
      }
    }
  }

  // Override the updateTablePlayers method for War game
  updateTablePlayers(players, currentUsername) {
    this.updateTablePlayersWar(players, currentUsername);
  }
  
   // Override updateGamePhaseUI to handle card stacks
   updateGamePhaseUI(phase) {
    // Call parent method
    super.updateGamePhaseUI(phase);
    
    // If phase changes to playing, initialize War UI
    if (this.gameState && this.gameState.phase === 'playing') {
      if (!this.uiInitialized) {
        console.log('Table updated but UI not initialized, initializing now');
        this.initializeWarUI();
      } else if (!document.getElementById('playerCardStack')) {
        // If stacks don't exist but should, create them
        console.log('Table updated but card stacks missing, creating them');
        this.createPlayerCardStacks();
        this.updateCardStackCounts();
      }
    }
  }

  handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received in WarGame:', data.type);
      
      // Special handling for player actions
      if (data.type === 'player_action') {
        // Handle this directly without calling parent
        this.handlePlayerAction(data);
      } else {
        // For other message types, call parent handler
        super.handleWebSocketMessage(event);
      }
      
      // Handle war-specific messages
      switch(data.type) {
        case 'war_start':
          this.handleWarStart(data);
          break;
          
        case 'war_progress':
          this.handleWarProgress(data);
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message in WarGame:', error);
    }
  }

  handleTurnChange(data) {
    // Call parent method
    super.handleTurnChange(data);
    
    // Force update card stack state after turn changes
    setTimeout(() => {
      console.log('Turn changed, updating card stack state');
      this.updateCardStackState();
    }, 200);
  }
  
  
  handleWarStart(data) {
    console.log(`War started! Round ${data.warRound}`);
    
    // Update UI to show war mode
    this.warMode = true;
    document.body.classList.add('war-mode');
    
    // Show war notification
    this.showNotification(`WAR! Cards have equal value. Each player puts one card face down and one face up!`, 'war');
    
    // Update result indicator
    const resultIndicator = document.getElementById('warResult');
    if (resultIndicator) {
      resultIndicator.textContent = 'WAR!';
      resultIndicator.className = 'war-result-indicator war show'; // Add 'show' class
      
      // Add timeout to hide the result after 3 seconds
      setTimeout(() => {
        resultIndicator.classList.remove('show');
      }, 3000);
    }
  }

  handleWarProgress(data) {
    // Show notification about war progress
    this.showNotification(data.message, 'war-progress');
    
    // If this is about face-down cards being placed, animate them
    if (data.message.includes("face down")) {
      // Animate face-down cards for both players
      this.animateFaceDownCards();
    }
    
    // Update scoreboard if it exists
    this.updateScoreboard();
  }

  handleRoundResult(data) {
    console.log(`Round result received: ${data.winnerName} won ${data.cardCount} cards`);
    
    // Get result indicator
    const resultIndicator = document.getElementById('warResult');
  if (resultIndicator) {
    resultIndicator.textContent = `${data.winnerName} wins the round!`;
    resultIndicator.className = 'war-result-indicator winner show'; // Add 'show' class
    
    // Add timeout to hide the result after 3 seconds
    setTimeout(() => {
      resultIndicator.classList.remove('show');
    }, 3000);
  }
    
    // Update game state from server data
    this.gameState.round = data.newRound;
    
    // Clear played cards (UI only)
    this.playedCards = {};
    
    // Clear card slots
    this.clearCardSlots();
    
    // Show notification
    this.showNotification(`${data.winnerName} wins the round and takes ${data.cardCount} cards!`, "winner");
    
    // Request updated game state with correct sequencing
    this.sendWebSocketMessage({
      type: 'game_state_request',
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    // Request connected users to update UI with new card counts
    setTimeout(() => {
      this.sendWebSocketMessage({
        type: 'connected_users',
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
      
      // Update scoreboard after a short delay to ensure data has arrived
      setTimeout(() => {
        this.updateScoreboard();
        
        // Update card stacks if they exist
        if (document.getElementById('playerCardStack')) {
          this.updateCardStackCounts();
        }
        
        // Apply highlighting only after all updates are complete
        if (data.winnerId) {
          this.highlightCurrentPlayer(data.winnerId);
        }
      }, 200);
    }, 300);
  }

  handlePlayerAction(data) {
    // Don't call super.handlePlayerAction to avoid conflicting animations
    // super.handlePlayerAction(data);
    
    const { playerId, username, action } = data;
    
    // Determine if the action is from an opponent
    const isOpponent = String(playerId) !== String(this.currentPlayerId);
    
    // For specific card plays in War game
    if (action.type === 'play_card' || action.type === 'play_war_card') {
      // If we have the card data
      const cardId = action.cardId;
      const card = this.cardsById[cardId];
      
      if (card) {
        // Create the same animation key as the parent class would
        const animationKey = `card-play-${playerId}-${cardId}`;
        
        // Check if animation is already in progress from parent class
        if (this.isAnimationInProgress(animationKey)) {
          console.log(`WAR: Animation already in progress for ${animationKey}, skipping duplicate`);
          return;
        }
        
        // Check if we're in war mode for special handling
        if (action.warMode || action.type === 'play_war_card' || 
          (this.gameState && this.gameState.warState && this.gameState.warState.inWar)) {
          console.log(`War card played by ${username} (${playerId})`);
          
          // Update UI tracking
          if (!this.playedCards[playerId]) {
            this.playedCards[playerId] = card;
          }
          
          // Update the card slot
          this.handleWarCardAction(playerId, username, cardId);
        } else {
          // For normal card plays, use the regular animation, but mark it as in progress first
          this.setAnimationInProgress(animationKey, 1000);
          console.log(`WAR: Animation started for ${animationKey}`);
          
          this.animateCardPlay(card, false, isOpponent);
        }
        
        // Clear any face down card previously in this slot if needed
        if (this.faceDownCardSlots && this.faceDownCardSlots[playerId]) {
          delete this.faceDownCardSlots[playerId];
        }
        
        // Update card stack counts after a short delay to ensure hand data is updated
        setTimeout(() => {
          if (document.getElementById('playerCardStack')) {
            this.updateCardStackCounts();
          }
        }, 500);
      }
    }
  }
  
  animateFaceDownCards() {
    // Get all players for reference
    if (!this.players || this.players.length < 2) return;
    
    // Get card back image URL
    const cardBackImage = this.cardsById[54]?.picture || 'card_back.png';
    
    // Animate for each player (one at a time with delay)
    this.players.slice(0, 2).forEach((player, index) => {
      // Determine if it's the current player or opponent
      const isOpponent = String(player.id) !== String(this.currentPlayerId);
      
      // Add short delay for second player for better visual effect
      setTimeout(() => {
        // Get responsive dimensions
        const cardDimensions = this.getCardDimensions();
        
        // Create a face down card element for animation
        const animatedCard = document.createElement('div');
        animatedCard.className = 'animated-card face-down';
        animatedCard.style.position = 'absolute';
        animatedCard.style.width = cardDimensions.width;
        animatedCard.style.height = cardDimensions.height;
        animatedCard.style.zIndex = '2000'; // Higher z-index to ensure it appears above stacks
        animatedCard.style.transition = 'all 0.5s ease';
        
        // Add card back image
        const cardImg = document.createElement('img');
        cardImg.src = cardBackImage;
        cardImg.alt = 'Card face down';
        cardImg.style.width = '100%';
        cardImg.style.height = '100%';
        cardImg.style.borderRadius = '8px';
        animatedCard.appendChild(cardImg);
        
        // Set starting position based on player
        if (isOpponent) {
          // For opponent cards - come from top stack
          const opponentStack = document.getElementById('opponentCardStack');
          if (opponentStack) {
            const rect = opponentStack.getBoundingClientRect();
            animatedCard.style.top = `${rect.top + rect.height/2}px`;
            animatedCard.style.left = `${rect.left + rect.width/2}px`;
          } else {
            // Fallback starting position
            animatedCard.style.top = '80px';
            animatedCard.style.bottom = 'auto';
          }
        } else {
          // For player cards - come from bottom stack
          const playerStack = document.getElementById('playerCardStack');
          if (playerStack) {
            const rect = playerStack.getBoundingClientRect();
            animatedCard.style.bottom = `${globalThis.innerHeight - rect.bottom - rect.height/2}px`;
            animatedCard.style.left = `${rect.left + rect.width/2}px`;
          } else {
            // Fallback starting position
            animatedCard.style.bottom = '150px';
            animatedCard.style.top = 'auto';
          }
        }
        
        animatedCard.style.transform = 'translateX(-50%)';
        
        // Add to document
        document.body.appendChild(animatedCard);
        
        // Clear the card slot first
        const slotId = isOpponent ? 'player1Slot' : 'player2Slot';
        const slot = document.getElementById(slotId);
        if (slot) {
          slot.innerHTML = '';
        }
        
        // Animate to destination
        setTimeout(() => {
          // War cards go to center with special effect
          if (isOpponent) {
            // Opponent's card destination - player1 slot
            const slot = document.getElementById('player1Slot');
            if (slot) {
              const rect = slot.getBoundingClientRect();
              animatedCard.style.top = `${rect.top}px`;
              animatedCard.style.left = `${rect.left + rect.width/2}px`;
            } else {
              // Fallback if slot not found
              animatedCard.style.top = 'calc(50% - 150px)';
            }
          } else {
            // Player's card destination - player2 slot
            const slot = document.getElementById('player2Slot');
            if (slot) {
              const rect = slot.getBoundingClientRect();
              animatedCard.style.bottom = `${globalThis.innerHeight - rect.bottom}px`;
              animatedCard.style.left = `${rect.left + rect.width/2}px`;
            } else {
              // Fallback if slot not found
              animatedCard.style.bottom = 'calc(50% - 150px)';
            }
          }
          
          // Only update the slot AFTER animation completes
          setTimeout(() => {
            // Update the slot with the face down card
            const slotId = isOpponent ? 'player1Slot' : 'player2Slot';
            const slot = document.getElementById(slotId);
            if (slot) {
              slot.innerHTML = '';
              const finalCardImg = document.createElement('img');
              finalCardImg.src = cardBackImage;
              finalCardImg.alt = 'Card face down';
              finalCardImg.className = 'war-card-image face-down';
              slot.appendChild(finalCardImg);
            }
            
            // Remove the animated element
            animatedCard.remove();
            
            // Store that this slot has a face down card
            this.faceDownCardSlots = this.faceDownCardSlots || {};
            this.faceDownCardSlots[player.id] = true;
          }, 500);
        }, 10);
      }, index * 800); // Slight delay between players
    });
  }
}

// Initialize the War game when the window is loaded
globalThis.addEventListener('load', function() {
  console.log('War Game script loaded, initializing game...');
  
  try {
    globalThis.warGame = new WarGame();
    globalThis.cardGame = globalThis.warGame;
    
    console.log('War Game initialized successfully');
  } catch (error) {
    console.error('Error initializing War Game:', error);
  }
});