// war-game.js - War Card Game Implementation

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
    this.warMode = false; // Whether we're in a war
    this.warPile = []; // Cards in the war pile
    this.playedCards = {}; // Cards played in current round
    this.roundWinner = null; // Winner of the current round
    
    // Custom event listeners for War game
    document.addEventListener('DOMContentLoaded', () => {
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.addEventListener('click', () => this.playTopCard());
      }
    });
  }
  
  // Override to add war game specific UI
  initPokerTable() {
    // Call parent method first
    super.initPokerTable();
    
    // Check if we have the necessary elements
    const pokerTable = document.querySelector('.poker-table-container');
    
    if (!pokerTable) {
      // Create the poker table
      const table = document.createElement('div');
      table.className = 'poker-table-container';
      document.body.appendChild(table);
      this.uiElements.pokerTable = table;
      
      // Create battle area
      this.createBattleArea();
    } else {
      this.uiElements.pokerTable = pokerTable;
      this.createBattleArea();
    }
  }
  
  // Create war battle area
  createBattleArea() {
    if (!this.uiElements.pokerTable) return;
    
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
    actionButton.addEventListener('click', () => this.playTopCard());
    
    // Create result indicator
    const resultIndicator = document.createElement('div');
    resultIndicator.className = 'war-result-indicator';
    resultIndicator.id = 'warResult';
    
    // Create scoreboard
    this.createScoreboard();
    
    // Assemble battle area
    battleArea.appendChild(player1Slot);
    battleArea.appendChild(vsIndicator);
    battleArea.appendChild(player2Slot);
    battleArea.appendChild(document.createElement('br'));
    battleArea.appendChild(actionButton);
    battleArea.appendChild(resultIndicator);
    
    // Add to the table
    this.uiElements.pokerTable.appendChild(battleArea);
  }
  
  // Create scoreboard for War game
  createScoreboard() {
    // Create scoreboard container
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
    
    // Create round counter
    const roundCounter = document.createElement('div');
    roundCounter.className = 'war-round-counter';
    roundCounter.id = 'warRoundCounter';
    roundCounter.textContent = 'Round: 1';
    scoreboard.appendChild(roundCounter);
    
    // Add to document
    document.body.appendChild(scoreboard);
  }
  
  // Update scoreboard
  updateScoreboard() {
    const scoreContainer = document.getElementById('warScores');
    const roundCounter = document.getElementById('warRoundCounter');
    
    if (!scoreContainer || !this.players || this.players.length < 2) return;
    
    // Clear current scores
    scoreContainer.innerHTML = '';
    
    // Add each player's score
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
    
    // Update round counter
    if (roundCounter) {
      roundCounter.textContent = `Round: ${this.gameState.round || 1}`;
    }
  }
  
  // Override to customize player display
  updateTablePlayersAndScoreboard(players, currentUsername) {
    super.updateTablePlayers(players, currentUsername);
    
    // Also update scoreboard
    this.updateScoreboard();

    this.updateTablePlayersWar(players, currentUsername);
  }
  
  // Play top card from the player's hand
  playTopCard() {
    // Check if it's the player's turn
    if (!this.isMyTurn()) {
      this.showNotification("It's not your turn to play");
      return;
    }
    
    // Get player's hand
    const playerHand = this.hands[this.currentPlayerId];
    if (!playerHand || playerHand.length === 0) {
      this.showNotification("You don't have any cards left");
      return;
    }
    
    // Disable the button while processing
    const actionButton = document.getElementById('warActionButton');
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.textContent = 'Processing...';
    }
    
    if (this.warMode) {
      // In war mode, play multiple cards
      const warCount = Math.min(4, playerHand.length);
      
      // Send war play cards action
      this.sendWebSocketMessage({
        type: 'player_action',
        action: {
          type: 'play_war_cards',
          count: warCount
        },
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
      
      // Handle locally
      this.playWarCards(warCount);
    } else {
      // Normal play - top card
      const topCard = playerHand[0];
      
      // Send play card action
      this.sendWebSocketMessage({
        type: 'player_action',
        action: {
          type: 'play_card',
          cardId: topCard.id
        },
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
      
      // Handle locally
      this.playTopCardLocal();
    }
  }
  
  // Play top card locally
  playTopCardLocal() {
    // Get player's hand
    const playerHand = this.hands[this.currentPlayerId];
    if (!playerHand || playerHand.length === 0) return;
    
    // Take the top card
    const card = playerHand.shift();
    
    // Add to played cards
    this.playedCards[this.currentPlayerId] = card;
    
    // Update card slot
    this.updateCardSlot(this.currentPlayerId, card);
    
    // Update hand display
    this.updateHandDisplay();
    
    // If both players have played, resolve the round
    if (Object.keys(this.playedCards).length === 2) {
      this.resolveRound();
    } else {
      // Otherwise, advance turn
      this.advanceTurn();
    }
  }
  
  // Play war cards (face down + face up)
  playWarCards(count) {
    // Get player's hand
    const playerHand = this.hands[this.currentPlayerId];
    if (!playerHand || playerHand.length === 0) return;
    
    // Can't play more cards than in hand
    const cardsToPlay = Math.min(count, playerHand.length);
    
    if (cardsToPlay === 0) return;
    
    // Take cards from hand
    const warCards = playerHand.splice(0, cardsToPlay - 1);
    const faceUpCard = playerHand.shift();
    
    // Add to war pile
    this.warPile.push(...warCards);
    
    // Add face up card to played cards
    this.playedCards[this.currentPlayerId] = faceUpCard;
    
    // Update card slot with face up card
    this.updateCardSlot(this.currentPlayerId, faceUpCard);
    
    // Display war cards animation
    this.displayWarCards(warCards, faceUpCard);
    
    // Update hand display
    this.updateHandDisplay();
    
    // If both players have played, resolve the round
    if (Object.keys(this.playedCards).length === 2) {
      this.resolveRound();
    } else {
      // Otherwise, advance turn
      this.advanceTurn();
    }
  }
  
  // Display war cards animation
  displayWarCards(faceDownCards, faceUpCard) {
    // Create container for war cards
    const warContainer = document.createElement('div');
    warContainer.className = 'war-cards-container';
    warContainer.style.position = 'absolute';
    warContainer.style.zIndex = '100';
    warContainer.style.bottom = '200px';
    warContainer.style.left = '50%';
    warContainer.style.transform = 'translateX(-50%)';
    
    // Add face down cards
    faceDownCards.forEach((card, index) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'war-card';
      cardElement.style.position = 'absolute';
      cardElement.style.left = `${index * 20}px`;
      cardElement.style.zIndex = index;
      
      // Use card back image
      const cardImage = document.createElement('img');
      cardImage.src = this.cardsById[54].picture;
      cardImage.alt = 'Card back';
      cardImage.className = 'card-image';
      
      cardElement.appendChild(cardImage);
      warContainer.appendChild(cardElement);
    });
    
    // Add face up card
    const faceUpElement = document.createElement('div');
    faceUpElement.className = 'war-card face-up';
    faceUpElement.style.position = 'absolute';
    faceUpElement.style.left = `${faceDownCards.length * 20}px`;
    faceUpElement.style.zIndex = faceDownCards.length;
    
    const faceUpImage = document.createElement('img');
    faceUpImage.src = faceUpCard.picture;
    faceUpImage.alt = `${faceUpCard.rank} of ${faceUpCard.suit}`;
    faceUpImage.className = 'card-image';
    
    faceUpElement.appendChild(faceUpImage);
    warContainer.appendChild(faceUpElement);
    
    // Add to document
    document.body.appendChild(warContainer);
    
    // Remove after animation
    setTimeout(() => {
      warContainer.remove();
    }, 2000);
  }
  
  // Update card slot with the played card
  updateCardSlot(playerId, card) {
    // Find the correct slot based on player position
    let slot;
    const playerIndex = this.players.findIndex(p => String(p.id) === String(playerId));
    
    if (playerIndex === 0) {
      // First player uses player1Slot
      slot = document.getElementById('player1Slot');
    } else {
      // Second player uses player2Slot
      slot = document.getElementById('player2Slot');
    }
    
    if (!slot) return;
    
    // Clear slot
    slot.innerHTML = '';
    
    // Create card image
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardImage.className = 'war-card-image';
    
    // Add to slot
    slot.appendChild(cardImage);
  }
  
  // Clear card slots
  clearCardSlots() {
    const player1Slot = document.getElementById('player1Slot');
    const player2Slot = document.getElementById('player2Slot');
    
    if (player1Slot) player1Slot.innerHTML = '';
    if (player2Slot) player2Slot.innerHTML = '';
  }
  
  // Advance to the next player's turn
  advanceTurn() {
    if (this.players.length < 2) return;
    
    // Find current player index
    const currentIndex = this.players.findIndex(p => String(p.id) === String(this.gameState.currentTurn));
    
    // Calculate next player index
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % this.players.length : 0;
    
    // Set next player's turn
    this.gameState.currentTurn = this.players[nextIndex].id;
    
    // Highlight next player
    this.highlightCurrentPlayer(this.gameState.currentTurn);
    
    // Update action button
    const actionButton = document.getElementById('warActionButton');
    if (actionButton) {
      actionButton.disabled = String(this.gameState.currentTurn) !== String(this.currentPlayerId);
      actionButton.textContent = 'Play Cards';
    }
    
    // Send turn change message
    this.sendWebSocketMessage({
      type: 'turn_change',
      playerId: this.gameState.currentTurn,
      username: this.players[nextIndex].username,
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
  }
  
  // Compare cards to determine winner
  compareCards(card1, card2) {
    if (!card1 || !card2) return 0;
    
    // Compare card values
    if (card1.value > card2.value) return 1; // First player wins
    if (card1.value < card2.value) return 2; // Second player wins
    return 0; // War (tie)
  }
  
  // Resolve the round after both players have played
  resolveRound() {
    if (Object.keys(this.playedCards).length !== 2) return;
    
    // Get the two player IDs
    const [player1Id, player2Id] = Object.keys(this.playedCards);
    
    // Get the played cards
    const card1 = this.playedCards[player1Id];
    const card2 = this.playedCards[player2Id];
    
    // Compare cards
    const result = this.compareCards(card1, card2);
    
    // Get result indicator
    const resultIndicator = document.getElementById('warResult');
    
    if (result === 0) {
      // It's a war!
      if (resultIndicator) {
        resultIndicator.textContent = "It's a WAR!";
        resultIndicator.className = 'war-result-indicator war';
      }
      
      // Add cards to war pile
      this.warPile.push(card1, card2);
      
      // Enter war mode
      this.warMode = true;
      
      // Update button text
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.textContent = 'Play War Cards';
        actionButton.disabled = false;
      }
      
      // Show notification
      this.showNotification("It's a WAR! Each player plays 4 more cards", "war");
      
      // Reset played cards
      this.playedCards = {};
      
      // Make a short pause before starting next round
      setTimeout(() => {
        // Clear card slots
        this.clearCardSlots();
        
        // First player's turn
        this.gameState.currentTurn = this.players[0].id;
        this.highlightCurrentPlayer(this.gameState.currentTurn);
        
        // Enable button for first player
        if (actionButton) {
          actionButton.disabled = String(this.gameState.currentTurn) !== String(this.currentPlayerId);
        }
        
        // Send turn change message
        this.sendWebSocketMessage({
          type: 'turn_change',
          playerId: this.gameState.currentTurn,
          username: this.players[0].username,
          gameId: this.currentGameId,
          auth_token: localStorage.getItem('auth_token')
        });
      }, 2000);
    } else {
      // We have a winner
      const winnerId = result === 1 ? player1Id : player2Id;
      const winner = this.players.find(p => String(p.id) === String(winnerId));
      
      if (resultIndicator && winner) {
        resultIndicator.textContent = `${winner.username} wins the round!`;
        resultIndicator.className = 'war-result-indicator winner';
      }
      
      // Add cards to winner's hand
      // Create a collection of all cards to award
      const cardsToAward = [card1, card2, ...this.warPile];
      
      // Award the cards to the winner
      if (!this.hands[winnerId]) {
        this.hands[winnerId] = [];
      }
      
      // Add cards to the bottom of the winner's deck
      this.hands[winnerId].push(...cardsToAward);
      
      // Clear war pile
      this.warPile = [];
      
      // Exit war mode
      this.warMode = false;
      
      // Reset played cards
      this.playedCards = {};
      
      // Increment round counter
      this.gameState.round = (this.gameState.round || 1) + 1;
      
      // Update scoreboard
      this.updateScoreboard();
      
      // Reset button
      const actionButton = document.getElementById('warActionButton');
      if (actionButton) {
        actionButton.textContent = 'Play Cards';
        actionButton.disabled = false;
      }
      
      // Show notification
      this.showNotification(`${winner.username} wins the round and takes ${cardsToAward.length} cards!`, "winner");
      
      // Check for game end
      this.checkGameEndConditions();
      
      // Make a short pause before starting next round
      setTimeout(() => {
        // Clear card slots
        this.clearCardSlots();
        
        // First player's turn for next round
        this.gameState.currentTurn = this.players[0].id;
        this.highlightCurrentPlayer(this.gameState.currentTurn);
        
        // Enable button for first player
        if (actionButton) {
          actionButton.disabled = String(this.gameState.currentTurn) !== String(this.currentPlayerId);
        }
        
        // Send turn change message for next round
        this.sendWebSocketMessage({
          type: 'turn_change',
          playerId: this.gameState.currentTurn,
          username: this.players[0].username,
          gameId: this.currentGameId,
          auth_token: localStorage.getItem('auth_token')
        });
      }, 2000);
    }
  }
  
  // Override the parent's player highlighting
  highlightCurrentPlayer(playerId) {
    // Remove active-player class from all seats
    const playerSeats = document.querySelectorAll('.player-seat');
    playerSeats.forEach(seat => seat.classList.remove('active-player'));
    
    // Find the player
    const player = this.players.find(p => String(p.id) === String(playerId));
    
    if (!player) return;
    
    // Add active-player class to the current player's seat
    const seat = document.getElementById(`player-seat-${player.username}`);
    if (seat) {
      seat.classList.add('active-player');
    }
    
    // Update action button
    const actionButton = document.getElementById('warActionButton');
    if (actionButton) {
      actionButton.disabled = String(playerId) !== String(this.currentPlayerId);
    }
    
    // Set body class for my-turn state
    if (String(playerId) === String(this.currentPlayerId)) {
      document.body.classList.add('my-turn');
    } else {
      document.body.classList.remove('my-turn');
    }
  }
  
  // Override to customize the table players display
  updateTablePlayersWar(players, currentUsername) {
    if (!this.uiElements.pokerTable) {
      console.warn('Poker table not initialized');
      return;
    }
    
    // Remove existing player seats
    const existingSeats = document.querySelectorAll('.player-seat');
    existingSeats.forEach(seat => seat.remove());
    
    // Create two positions for War game
    const positions = [
      { top: '-100px', left: '50%', transform: 'translateX(-50%)' },
      { bottom: '-100px', left: '50%', transform: 'translateX(-50%)' }
    ];
    
    // Add player seats for up to 2 players
    players.slice(0, 2).forEach((player, index) => {
      const seat = document.createElement('div');
      seat.className = 'player-seat';
      seat.id = `player-seat-${player.username}`;
      
      // Mark current player
      if (player.username === currentUsername) {
        seat.classList.add('current-player');
      }
      
      // Highlight active player (player whose turn it is)
      if (this.gameState && this.gameState.currentTurn === player.id) {
        seat.classList.add('active-player');
      }
      
      // Position the seat
      const position = positions[index];
      Object.assign(seat.style, position);
      
      // Create player info section
      const playerInfo = document.createElement('div');
      playerInfo.className = 'player-info';
      
      // Create player avatar
      const avatar = document.createElement('img');
      avatar.className = 'player-avatar';
      avatar.src = player.pp_path || 'profile_pictures/default.jpg';
      avatar.alt = player.username;
      
      // Create player details section
      const details = document.createElement('div');
      details.className = 'player-details';
      
      // Create player name
      const name = document.createElement('div');
      name.className = 'player-name';
      name.textContent = player.username;
      
      // Create player cards indicator
      const cardCount = document.createElement('div');
      cardCount.className = 'player-cards';
      
      // Get hand size
      const handSize = this.hands[player.id] ? this.hands[player.id].length : 0;
      
      // Create mini cards with count
      for (let i = 0; i < Math.min(5, handSize); i++) {
        const miniCard = document.createElement('div');
        miniCard.className = 'card-mini';
        cardCount.appendChild(miniCard);
      }
      
      // Add card count
      if (handSize > 0) {
        const count = document.createElement('span');
        count.className = 'cards-count';
        count.textContent = handSize;
        cardCount.appendChild(count);
      }
      
      // Assemble the player seat
      details.appendChild(name);
      details.appendChild(cardCount);
      playerInfo.appendChild(avatar);
      playerInfo.appendChild(details);
      seat.appendChild(playerInfo);
      
      // Add the seat to the table
      this.uiElements.pokerTable.appendChild(seat);
    });
    
    // Also update scoreboard
    this.updateScoreboard();
  }
}

// Initialize the War game when the window is loaded
globalThis.addEventListener('load', function() {
  console.log('War Game script loaded, initializing game...');
  
  // Create the game instance
  try {
    globalThis.warGame = new WarGame();
    globalThis.cardGame = globalThis.warGame; // Also set as the main card game
    
    // Expose functions for HTML onclick handlers
    globalThis.playWarCards = function() {
      if (globalThis.warGame) {
        globalThis.warGame.playTopCard();
      }
    };
    
    console.log('War Game initialized successfully');
  } catch (error) {
    console.error('Error initializing War Game:', error);
  }
});