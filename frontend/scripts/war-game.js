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
        // Hide the button as we won't use it
        actionButton.style.display = 'none';
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
  
  // Create result indicator
  const resultIndicator = document.createElement('div');
  resultIndicator.className = 'war-result-indicator';
  resultIndicator.id = 'warResult';
  
  // Assemble battle area - remove the action button completely
  battleArea.appendChild(player1Slot);
  battleArea.appendChild(vsIndicator);
  battleArea.appendChild(player2Slot);
  battleArea.appendChild(document.createElement('br'));
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
  
  // In war-game.js, modify the playCard method
  playCard(cardId) {
    // Check if it's the player's turn
    if (!this.isMyTurn()) {
      this.showNotification("It's not your turn to play");
      console.log("Turn prevented - not this player's turn");
      return;
    }
    
    // Check if we already have a played card for this player
    if (this.playedCards[this.currentPlayerId]) {
      console.log("Card already played for this player in this round");
      return;
    }
    
    // Get player's hand
    const playerHand = this.hands[this.currentPlayerId];
    if (!playerHand || playerHand.length === 0) {
      this.showNotification("You don't have any cards left");
      return;
    }
    
    // Find the card in the player's hand
    const cardIndex = playerHand.findIndex(card => Number(card.id) === Number(cardId));
    if (cardIndex === -1) {
      console.warn(`Card ${cardId} not found in player's hand`);
      return;
    }
    
    // Get the card
    const card = playerHand[cardIndex];
    
    console.log(`Playing card ${card.id} from ${this.currentPlayerId} - current turn: ${this.gameState.currentTurn}`);
    
    // Send play card action to server
    this.sendWebSocketMessage({
      type: 'player_action',
      action: {
        type: 'play_card',
        cardId: card.id
      },
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    // Remove the card from hand
    playerHand.splice(cardIndex, 1);
    
    // Record played card
    this.playedCards[this.currentPlayerId] = card;
    
    // Update UI
    this.updateCardSlot(this.currentPlayerId, card);
    this.updateHandDisplay();
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
      //this.advanceTurn(); 
    }
  }

  clearTable() {
    // Clear card slots
    this.clearCardSlots();
    
    // CRITICAL: Reset played cards object
    this.playedCards = {};
    console.log("Explicitly clearing playedCards in clearTable", this.playedCards);
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
  
  // Replace this method in war-game.js
  updateCardSlot(playerId, card) {
    // Find the correct slot based on player's perspective
    let slot;
    
    // If it's the current player's card, place it in the near slot (player1Slot)
    // If it's the opponent's card, place it in the far slot (player2Slot)
    if (String(playerId) === String(this.currentPlayerId)) {
      slot = document.getElementById('player2Slot');
    } else {
      slot = document.getElementById('player1Slot');
    }
    
    if (!slot) {
      console.warn(`Card slot not found for player ${playerId}`);
      return;
    }
    
    // Clear slot
    slot.innerHTML = '';
    
    // Create card image
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardImage.className = 'war-card-image';
    
    // Add to slot
    slot.appendChild(cardImage);
    console.log(`Updated card slot for player ${playerId} with card ${card.id}`);
  }
    
  // Clear card slots
  clearCardSlots() {
    const player1Slot = document.getElementById('player1Slot');
    const player2Slot = document.getElementById('player2Slot');
    
    if (player1Slot) player1Slot.innerHTML = '';
    if (player2Slot) player2Slot.innerHTML = '';
  }
  
  // Compare cards to determine winner
  compareCards(card1, card2) {
    if (!card1 || !card2) return 0;
    
    // Compare card values
    if (card1.value > card2.value) return 1; // First player wins
    if (card1.value < card2.value) return 2; // Second player wins
    return 0; // War (tie)
  }

  handlePlayCardAction(playerId, username, cardId) {
    console.log(`Player ${username} played card ${cardId}`);
    
    // Get the card data
    const cardData = this.cardsById[cardId];
    if (!cardData) {
        console.warn(`Card data not found for ID ${cardId}`);
        return;
    }
    
    // Update the UI to show the played card
    this.updateCardSlot(playerId, cardData);
    
    // Show animation and notification
    this.animateCardPlay(cardData);
    this.showNotification(`${username} played a card`);
    
    // If this was our card, update our hand (server already removed it)
    if (String(playerId) === String(this.currentPlayerId) && this.hands[playerId]) {
        // Find and remove the card from local hand representation
        const cardIndex = this.hands[playerId].findIndex(c => Number(c.id) === Number(cardId));
        if (cardIndex !== -1) {
            this.hands[playerId].splice(cardIndex, 1);
            this.updateHandDisplay();
        }
    }
    
    // CRITICAL FIX: Record played card
    if (!this.playedCards) {
        this.playedCards = {};
    }
    this.playedCards[playerId] = cardData;
    console.log("Updated playedCards:", this.playedCards);
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