// war-game.js - War Card Game Implementation
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
    
    // Create scoreboard when game is initialized
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('warScoreboard')) {
        this.createScoreboard();
      }
    });
  }
  
  // Override the animateCardToPosition method for War-specific card animations
  animateCardToPosition(animatedCard, card, isWarCard, isOpponent) {
    setTimeout(() => {
      if (isWarCard) {
        // War cards go to center with special effect
        animatedCard.style.transform = 'translate(-50%, 0) scale(1.2)';
        animatedCard.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.5)';
        
        // Position in middle
        if (isOpponent) {
          animatedCard.style.top = 'calc(50% - 90px)';
        } else {
          animatedCard.style.bottom = 'calc(50% - 90px)';
        }
      } else {
        // Normal cards go to their appropriate slots
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
      }, isWarCard ? 800 : 500);
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
    this.animateCardPlay(card, true); // Pass true to indicate war card
    
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
    resultIndicator.className = 'war-result-indicator';
    resultIndicator.id = 'warResult';
    
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
    const playerSeats = document.querySelectorAll('.player-seat');
    playerSeats.forEach(seat => seat.classList.remove('active-player'));
    
    const player = this.players.find(p => String(p.id) === String(playerId));
    
    if (!player) return;
    
    const seat = document.getElementById(`player-seat-${player.username}`);
    if (seat) {
      seat.classList.add('active-player');
    }
    
    if (String(playerId) === String(this.currentPlayerId)) {
      document.body.classList.add('my-turn');
    } else {
      document.body.classList.remove('my-turn');
    }
  }
  
  updateTablePlayersWar(players, currentUsername) {
    if (!this.uiElements.pokerTable) {
      console.warn('Poker table not initialized');
      return;
    }
    
    const existingSeats = document.querySelectorAll('.player-seat');
    existingSeats.forEach(seat => seat.remove());
    
    // Create a sorted array where current player is always second (index 1)
    const sortedPlayers = [...players.slice(0, 2)].sort((a, b) => {
      if (a.username === currentUsername) return 1;
      if (b.username === currentUsername) return -1;
      return 0;
    });
    
    // Use the original positions - we'll now control the order of players instead
    const positions = [
      { top: '-100px', left: '50%', transform: 'translateX(-50%)' },
      { bottom: '-100px', left: '50%', transform: 'translateX(-50%)' }
    ];
    
    sortedPlayers.forEach((player, index) => {
      const seat = document.createElement('div');
      seat.className = 'player-seat';
      seat.id = `player-seat-${player.username}`;
      
      if (player.username === currentUsername) {
        seat.classList.add('current-player');
      }
      
      if (this.gameState && this.gameState.currentTurn === player.id) {
        seat.classList.add('active-player');
      }
      
      // Now we can use the index to position, because we've sorted the array
      const position = positions[index];
      Object.assign(seat.style, position);
      
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
      
      for (let i = 0; i < Math.min(5, handSize); i++) {
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
  }

  // Override the updateTablePlayers method for War game
  updateTablePlayers(players, currentUsername) {
    this.updateTablePlayersWar(players, currentUsername);
  }

  handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data.type);
      
      // Call parent handler first
      super.handleWebSocketMessage(event);
      
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
      console.error('Error handling WebSocket message:', error);
    }
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
      resultIndicator.className = 'war-result-indicator war';
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
      resultIndicator.className = 'war-result-indicator winner';
    }
    
    // Update game state from server data
    this.gameState.round = data.newRound;
    
    // Clear played cards (UI only)
    this.playedCards = {};
    
    // Clear card slots
    this.clearCardSlots();
    
    // Show notification
    this.showNotification(`${data.winnerName} wins the round and takes ${data.cardCount} cards!`, "winner");
    
    // Immediately request updated game state to get new card distribution
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
      console.log('Requesting connected users to update card counts');
      
      // Update scoreboard after a short delay to ensure data has arrived
      setTimeout(() => this.updateScoreboard(), 200);
    }, 300);
  }

  // Override handlePlayerAction to handle war-specific card plays
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
        // Check if we're in war mode for special handling
        if (action.warMode || action.type === 'play_war_card' || 
          (this.gameState && this.gameState.warState && this.gameState.warState.inWar)) {
        console.log(`War card played by ${username} (${playerId})`);
          
          // Update UI tracking
          if (!this.playedCards[playerId]) {
            this.playedCards[playerId] = card;
          }
          
          // Update the card slot with minimal animation to avoid conflicts
          const slotId = isOpponent ? 'player1Slot' : 'player2Slot';
          const slot = document.getElementById(slotId);
          
          if (slot) {
            // Clean up any face down card
            slot.innerHTML = '';
            
            // Create the new card image with a simple fade-in effect
            const cardImage = document.createElement('img');
            cardImage.src = card.picture;
            cardImage.alt = `${card.rank} of ${card.suit}`;
            cardImage.className = 'war-card-image';
            cardImage.style.opacity = '0';
            slot.appendChild(cardImage);
            
            // Fade in the card
            setTimeout(() => {
              cardImage.style.transition = 'opacity 0.5s ease';
              cardImage.style.opacity = '1';
            }, 50);
          }
        } else {
          // For normal card plays, use the regular animation
          this.animateCardPlay(card, false, isOpponent);
        }
        
        // Clear any face down card previously in this slot if needed
        if (this.faceDownCardSlots && this.faceDownCardSlots[playerId]) {
          delete this.faceDownCardSlots[playerId];
        }
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
        // Create a face down card element for animation
        const animatedCard = document.createElement('div');
        animatedCard.className = 'animated-card face-down';
        animatedCard.style.position = 'absolute';
        animatedCard.style.width = '120px';
        animatedCard.style.height = '180px';
        animatedCard.style.zIndex = '1000';
        animatedCard.style.transition = 'all 0.5s ease';
        
        // Add card back image
        const cardImg = document.createElement('img');
        cardImg.src = cardBackImage;
        cardImg.alt = 'Card face down';
        cardImg.style.width = '100%';
        cardImg.style.height = '100%';
        animatedCard.appendChild(cardImg);
        
        // Set starting position based on player
        if (isOpponent) {
          // For opponent cards - come from top
          animatedCard.style.top = '80px';
          animatedCard.style.bottom = 'auto';
        } else {
          // For player cards - come from bottom
          animatedCard.style.bottom = '150px';
          animatedCard.style.top = 'auto';
        }
        
        animatedCard.style.left = '50%';
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