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
    
    // Keep UI state properties only
    this.warMode = false;
    this.playedCards = {};
    
    // Create scoreboard when game is initialized
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('warScoreboard')) {
        this.createScoreboard();
      }
    });
  }
  
  // Keep UI methods
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
  
  // UI methods only - update card display
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
    
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
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
    
    const positions = [
      { top: '-100px', left: '50%', transform: 'translateX(-50%)' },
      { bottom: '-100px', left: '50%', transform: 'translateX(-50%)' }
    ];
    
    players.slice(0, 2).forEach((player, index) => {
      const seat = document.createElement('div');
      seat.className = 'player-seat';
      seat.id = `player-seat-${player.username}`;
      
      if (player.username === currentUsername) {
        seat.classList.add('current-player');
      }
      
      if (this.gameState && this.gameState.currentTurn === player.id) {
        seat.classList.add('active-player');
      }
      
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
  
  // In war-game.js, enhance the handleWarStart function:
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
    
    // Clear card slots to prepare for new cards
    this.clearCardSlots();
  }

  // Add or update the handleWarProgress method:
  handleWarProgress(data) {
    // Show notification about war progress
    this.showNotification(data.message, 'war-progress');
    
    // Update scoreboard if it exists
    this.updateScoreboard();
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