// card-game.js - Base Card Game Framework

class CardGameFramework {
  constructor(options = {}) {
    // Game state
    this.websocket = null;
    this.currentGameId = null;
    this.currentPlayerId = null;
    this.currentUsername = null;
    this.players = [];
    this._animationsInProgress = {};
    this.gameState = {
      phase: 'waiting', // waiting, setup, playing, finished
      currentTurn: null,
      round: 1
    };
    
    // Card collections (maintained in memory)
    this.deck = [];
    this.hands = {}; // Player hands indexed by player ID
    this.discardPile = [];
    this.cardsById = {}; // Quick lookup for card data
    this.playedCards = {};
    
    // UI Elements
    this.uiElements = {
      cardStack: null,
      chatContainer: null,
      messageInput: null,
      pokerTable: null,
      drawPile: null,
      handContainer: null,
      discardPile: null,
      chatToggle: null
    };
    
    // Game settings with defaults
    this.settings = {
      maxPlayers: options.maxPlayers || 4,
      startingHandSize: options.startingHandSize || 7,
      winCondition: options.winCondition || 'empty-hand', // empty-hand, points, etc.
      allowedActions: options.allowedActions || ['draw', 'play', 'discard']
    };
    
    // Flag to track initialization status
    this.componentsInitialized = false;
    this.cardsLoaded = false;
    
    // Bind methods to this instance
    this.init = this.init.bind(this);
    this.connectWebSocket = this.connectWebSocket.bind(this);
    this.handleWebSocketOpen = this.handleWebSocketOpen.bind(this);
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.handleWebSocketError = this.handleWebSocketError.bind(this);
    this.handleWebSocketClose = this.handleWebSocketClose.bind(this);
    this.handlePageUnload = this.handlePageUnload.bind(this);
    this.loadCardResources = this.loadCardResources.bind(this);
    
    // Fix initialization with proper binding
    if (document.readyState === 'loading') {
      // Document still loading, add event listener
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded event fired, initializing game');
        this.init();
      });
    } else {
      // DOMContentLoaded has already fired, call init directly
      console.log('Document already loaded, initializing game immediately');
      setTimeout(() => this.init(), 0);
    }

    // Use arrow function to properly bind this context
    globalThis.addEventListener('beforeunload', (event) => this.handlePageUnload(event));

    // Also add direct initialization on window load for redundancy
    globalThis.addEventListener('load', () => {
      console.log('Window load event fired');
      if (!this.componentsInitialized) {
        console.log('Components not initialized yet, calling init()');
        this.init();
      }
    });

    console.log('CardGameFramework constructor completed');
  }
  
  // ====================== INITIALIZATION ======================
  async init() {
    try {
      // Get game ID from URL parameters or sessionStorage
      const urlParams = new URLSearchParams(globalThis.location.search);
      const gameIdParam = urlParams.get('gameId');
      this.currentGameId = gameIdParam || sessionStorage.getItem('currentGameId');
      
      // Get username from sessionStorage
      this.currentUsername = sessionStorage.getItem('currentUsername') || localStorage.getItem('currentUsername');
      
      console.log('Game initialization starting with:', {
        gameId: this.currentGameId,
        username: this.currentUsername
      });
      
      // If we don't have a game ID, check for active game
      if (!this.currentGameId) {
        console.log('No game ID found, checking for active game');
        await this.checkActiveGame();
      }
      
      if (!this.currentGameId) {
        console.error('No active game found, redirecting to games page');
        globalThis.location.href = 'games.html';
        return;
      }
      
      console.log(`Initializing game UI for game ID: ${this.currentGameId}`);
      
      // Initialize UI elements
      this.initUIElements();
      
      // Load card resources
      await this.loadCardResources();
      
      // Initialize game components immediately without timeout
      this.initGameComponents();
      this.componentsInitialized = true;
      console.log('Game components initialized');
      
      // Connect to WebSocket immediately after initialization
      console.log('Connecting to WebSocket now...');
      this.connectWebSocket();
      
      // Clear navigation flags
      sessionStorage.removeItem('intentionalNavigation');
      sessionStorage.removeItem('wsWasOpen');
    } catch (error) {
      console.error('Error during game initialization:', error);
      // Don't redirect immediately, let the user see the error
      alert('Error initializing game: ' + error.message);
    }
  }
  
  // Load all card resources at once
  async loadCardResources() {
    try {
      console.log('Loading card resources');
      const response = await fetch(appConfig.apiEndpoint('/api/cards'));      
      if (!response.ok) {
        throw new Error(`Failed to load cards: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store cards for easy lookup
      data.cards.forEach(card => {
        this.cardsById[card.id] = card;
      });
      
      console.log(`Loaded ${data.cards.length} card resources`);
      this.cardsLoaded = true;
      
      // Create initial deck
      this.createDeck();
      
      return data.cards;
    } catch (error) {
      console.error('Error loading card resources:', error);
      return [];
    }
  }
  
  // Create a deck from loaded card resources
  createDeck() {
    // Only include standard cards (1-52)
    this.deck = Object.values(this.cardsById)
      .filter(card => card.id >= 1 && card.id <= 52)
      .map(card => ({ ...card }));
    
    // Shuffle the deck
    this.shuffleDeck();
    
    console.log(`Created deck with ${this.deck.length} cards`);
  }
  
  // Shuffle the deck using Fisher-Yates algorithm
  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }
  
  // Check if user has an active game
  async checkActiveGame() {
    try {
      const response = await fetch(appConfig.apiEndpoint('/active-game'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        return false;
      }
      
      const gameData = await response.json();
      if (gameData && gameData.game && gameData.game.idGame) {
        console.log('Active game found:', gameData.game.idGame);
        this.currentGameId = gameData.game.idGame;
        sessionStorage.setItem('currentGameId', this.currentGameId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for active game:', error);
      return false;
    }
  }
  
  // Initialize UI element references
  initUIElements() {
    this.uiElements.cardStack = document.getElementById('cardStack');
    this.uiElements.chatContainer = document.querySelector('.container');
    this.uiElements.messageInput = document.getElementById('messageInput');
    this.uiElements.handContainer = document.getElementById('handContainer');
    
    console.log('UI elements initialized', this.uiElements);
  }
  
  // Initialize game components
  initGameComponents() {
    // Create and initialize the poker table
    this.initPokerTable();
    
    // Initialize the chat toggle
    this.initChatToggle();
    
    // Initialize the chat input
    this.initChatInput();
    
    // Setup event listeners
    this.setupEventListeners();

    // Add Finish Game button for debugging
    const gameActionsDiv = document.getElementById('gameActions') || document.createElement('div');
    if (!gameActionsDiv.id) {
      gameActionsDiv.id = 'gameActions';
      gameActionsDiv.className = 'game-actions';
      document.body.appendChild(gameActionsDiv);
    }

    // Create Finish Game button if it doesn't exist
    if (!document.getElementById('finishGameBtn')) {
      const finishGameBtn = document.createElement('button');
      finishGameBtn.id = 'finishGameBtn';
      finishGameBtn.className = 'game-control-btn finish-game';
      finishGameBtn.textContent = 'Finish Game';
      finishGameBtn.addEventListener('click', () => this.debugFinishGame());
      gameActionsDiv.appendChild(finishGameBtn);
    }
    
    console.log('Game components initialized');
  }

  // Debug method to finish game
  // deno-lint-ignore require-await
  async debugFinishGame() {
    try {
      console.log('Manually finishing game for debugging');
      this.showNotification('Finishing game...', 'info');
      
      // Find a winner (just use the first player for debugging)
      const winnerId = this.players.length > 0 ? this.players[0].id : this.currentPlayerId;
      const winnerName = this.players.find(p => p.id === winnerId)?.username || 'Player 1';
      
      // Set game phase to finished locally
      this.gameState.phase = 'finished';
      this.updateGamePhaseUI('finished');
      
      // Show game results UI
      this.showGameResults(winnerId, winnerName);
      
      // Notify server (optional)
      fetch(appConfig.apiEndpoint('/finish-game'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ gameId: this.currentGameId }),
        credentials: 'include'
      })
      .then(response => console.log('Game manually finished, server response:', response.status))
      .catch(error => console.error('Error finishing game:', error));
      
    } catch (error) {
      console.error('Error in debug finish game:', error);
      this.showErrorNotification('Error finishing game: ' + error.message);
    }
  }
  
  // ====================== WEBSOCKET HANDLING ======================
  connectWebSocket() {
    try {
      console.log('Attempting to connect WebSocket...');
      // Add the auth token to the URL for authentication
      const authToken = localStorage.getItem('auth_token');
      
      // Use the config for WebSocket URL
      const wsUrl = `${appConfig.websocketUrl}/ws?token=${encodeURIComponent(authToken)}`;
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      
      this.websocket = new WebSocket(wsUrl);
      
      // Add unbound functions with proper error handling
      this.websocket.onopen = (event) => {
        console.log('WebSocket OPEN event triggered:', event);
        this.handleWebSocketOpen(event);
      };
      
      this.websocket.onmessage = (event) => {
        console.log('WebSocket MESSAGE received');
        this.handleWebSocketMessage(event);
      };
      
      this.websocket.onerror = (event) => {
        console.error('WebSocket ERROR:', event);
        this.handleWebSocketError(event);
      };
      
      this.websocket.onclose = (event) => {
        console.log('WebSocket CLOSED:', event.code, event.reason);
        this.handleWebSocketClose(event);
      };
      
      console.log('WebSocket connection initialized');
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
    }
  
    this.startWebSocketStatusChecks();
  }
  

  // Check WebSocket status periodically
  startWebSocketStatusChecks() {
    // Check WebSocket status every 5 seconds
    this.wsCheckInterval = setInterval(() => {
      if (!this.websocket) {
        console.log('WebSocket not initialized yet');
        return;
      }
      
      const stateNames = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED'
      };
      
      console.log(`WebSocket status: ${stateNames[this.websocket.readyState]} (${this.websocket.readyState})`);
      
      // If closed or closing, try to reconnect unless navigating away
      if (this.websocket.readyState >= 2 && 
          sessionStorage.getItem('intentionalNavigation') !== 'true') {
        console.log('WebSocket disconnected, attempting to reconnect...');
        this.connectWebSocket();
      }
    }, 5000);
  }
  
  handleWebSocketOpen(_event) {
    console.log('WebSocket connection established');
    
    // Make sure we load the currentGameId from sessionStorage if not set
    if (!this.currentGameId) {
      this.currentGameId = sessionStorage.getItem('currentGameId');
      console.log(`Retrieved game ID from sessionStorage: ${this.currentGameId}`);
    }
    
    // Only request data if UI components and cards are ready
    if (this.componentsInitialized && this.cardsLoaded) {
      console.log('Components ready, sending initial requests');
      this.sendWebSocketMessage({ 
        type: 'join_game', 
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
    } else {
      // If components aren't ready yet, wait and then request data
      console.log('Components not fully initialized, waiting before sending requests...');
      const checkInterval = setInterval(() => {
        if (this.componentsInitialized && this.cardsLoaded) {
          clearInterval(checkInterval);
          console.log('Components now initialized, sending requests...');
          this.sendWebSocketMessage({ 
            type: 'join_game', 
            gameId: this.currentGameId,
            auth_token: localStorage.getItem('auth_token')
          });
        }
      }, 200);
    }
  }
  
  handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data.type);
      
      // Handle different message types
      switch(data.type) {
        case 'join_game_success':
          console.log(`Successfully joined game ${data.gameId}`);
          // Request game state and connected users
          this.sendWebSocketMessage({ 
            type: 'game_state_request', 
            gameId: this.currentGameId,
            auth_token: localStorage.getItem('auth_token')
          });
          
          this.sendWebSocketMessage({ 
            type: 'connected_users', 
            gameId: this.currentGameId,
            auth_token: localStorage.getItem('auth_token')
          });
          break;
          
        case 'message':
          this.handleChatMessage(data);
          break;
          
        case 'connected_users':
          this.handleConnectedUsers(data);
          break;
          
        case 'game_state':
          this.handleGameState(data);
          break;
          
        case 'player_action':
          this.handlePlayerAction(data);
          break;
          
        case 'turn_change':
          this.handleTurnChange(data);
          break;
          
        case 'error':
          this.handleError(data);
          break;

        case "round_result":
          this.handleRoundResult(data);
          break;

        case 'game_restart':
          this.handleRestartGame();
          break;

        case 'game_end':
          console.log('Game end message received:', data);
          
          // Update game state to finished
          this.gameState.phase = 'finished';
          this.updateGamePhaseUI('finished');
          
          // Show game results with restart button
          this.showGameResults(data.winnerId, data.winnerName);
          break;

        case 'redirect_to_lobby':
          this.handleRedirectToLobby(data);
          break;
        
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }
  
  handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    
    // Only redirect to login if not navigating to games page
    if (sessionStorage.getItem('wsWasOpen') !== 'true') {
      this.goToLogin();
    }
  }
  
  handleWebSocketClose(event) {
    console.log('WebSocket connection closed:', event);
    
    // Only redirect to login if we're not navigating to another page
    if (sessionStorage.getItem('wsWasOpen') !== 'true') {
      this.goToLogin();
    }
  }
  
  handlePageUnload(_event) {
    // Check if this is intentional navigation between our pages
    if (sessionStorage.getItem('intentionalNavigation') === 'true' || 
        sessionStorage.getItem('wsWasOpen') === 'true') {
      console.log('Intentional navigation detected, skipping disconnect');
      return;
    }
    
    // This appears to be a genuine page close/refresh
    const authToken = localStorage.getItem('auth_token');
    
    if (authToken && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      // Send disconnect message before closing
      this.websocket.send(JSON.stringify({
        type: 'disconnect',
        auth_token: authToken,
        gameId: this.currentGameId
      }));
    }
    
    // Use navigator.sendBeacon for more reliable disconnection
    if (navigator.sendBeacon) {
      const disconnectUrl = appConfig.apiEndpoint(`/disconnect-from-game?auth_token=${encodeURIComponent(authToken)}`);
      navigator.sendBeacon(disconnectUrl);
    }
  }
  
  // ====================== MESSAGE HANDLERS ======================
  handleChatMessage(data) {
    console.log('Processing chat message');
    const message = data;
    const messageBox = document.createElement('div');
    messageBox.className = 'message-box';
  
    // Store the userId as a data attribute if available
    if (message.userId) {
      messageBox.setAttribute('data-user-id', message.userId);
    }
  
    const userPicture = document.createElement('img');
    
    // Check if user_pp_path is base64 or a regular path
    if (message.user_pp_path && message.user_pp_path.startsWith('data:image')) {
      userPicture.src = message.user_pp_path;
    } else if (message.user_pp_path) {
      userPicture.src = message.user_pp_path;
    } else {
      userPicture.src = 'profile_pictures/default.jpg';
    }
    
    userPicture.alt = 'User Picture';
    userPicture.className = 'user-picture';
  
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
  
    const userName = document.createElement('strong');
    userName.className = 'user-name';
    userName.textContent = `${message.owner}:`;
  
    const messageText = document.createElement('span');
    messageText.className = 'message-text';
    messageText.textContent = message.message;
  
    messageContent.appendChild(userName);
    messageContent.appendChild(messageText);
    messageBox.appendChild(userPicture);
    messageBox.appendChild(messageContent);
  
    // Check if it's a message from the current user
    if (message.owner === this.currentUsername) {
      messageBox.classList.add('my-message');
    } else {
      messageBox.classList.add('other-message');
      
      // Show notification dot if chat is hidden and it's not from the current user
      if (this.uiElements.chatContainer && 
          this.uiElements.chatContainer.classList.contains('chat-hidden') &&
          this.uiElements.chatNotificationDot) {
        this.uiElements.chatNotificationDot.style.display = 'block';
      }
    }
  
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
      messagesContainer.appendChild(messageBox);
      // Auto-scroll to the bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
  
  handleConnectedUsers(data) {
    console.log('Processing connected users update');
    const users = data.users;
    
    // Create a map of current players to track who's already in the game
    const currentPlayersMap = {};
    this.players.forEach(player => {
      currentPlayersMap[player.username] = player;
    });
    
    // Process the incoming user list
    users.forEach(user => {
      // If this is a player we already know about, update their connected status
      if (currentPlayersMap[user.username]) {
        // Update other properties but keep the ID
        Object.assign(currentPlayersMap[user.username], user);
      } else {
        // This is a new player, add them to our map
        currentPlayersMap[user.username] = user;
      }
    });
    
    // Check for players who were in our list but aren't in the new list - they disconnected
    this.players.forEach(player => {
      if (!users.some(u => u.username === player.username)) {
        // This player is no longer in the server's list, mark as disconnected
        currentPlayersMap[player.username].connected = false;
      }
    });
    
    // Convert map back to array
    this.players = Object.values(currentPlayersMap);
    
    // Find this player in the players array and set currentPlayerId
    const currentPlayer = this.players.find(p => p.username === this.currentUsername);
    if (currentPlayer && currentPlayer.id) {
      this.currentPlayerId = currentPlayer.id;
      console.log(`Set current player ID to: ${this.currentPlayerId}`);
    }
    
    // Update the poker table players
    this.updateTablePlayers(this.players, this.currentUsername);
    
    // Initialize player hands if not already done
    if (Object.keys(this.hands).length === 0 && this.gameState.phase === 'playing') {
      this.initializeHands();
    }
    
    // Update profiles container with connected users
    this.updateProfilesContainer(this.players);
  }
  
  handleGameState(data) {
    console.log('Processing game state update', data);
    
    // Store previous state info to detect changes
    const previousRound = this.gameState ? this.gameState.round : null;
    const previousTurn = this.gameState ? this.gameState.currentTurn : null;
    
    // Update the local game state
    this.gameState = data.gameState;
    
    // If server is tracking hands, update our local representation
    if (this.gameState.playerHands) {
      this.hands = this.gameState.playerHands;
      this.updateHandDisplay();
    }
    
    // If server is tracking played cards, update locally
    if (this.gameState.playedCards) {
      this.playedCards = this.gameState.playedCards;
      
      // Update card display for each played card
      Object.entries(this.playedCards).forEach(([playerId, card]) => {
        if (card) this.updateCardSlot(playerId, card);
      });
    }
    
    // If the round has changed, update UI
    if (previousRound && this.gameState.round && previousRound !== this.gameState.round) {
      console.log(`Round changed from ${previousRound} to ${this.gameState.round}`);
      
      // Clear the table UI if method exists
      if (this.clearTable) {
        this.clearTable();
      }
    }
    
    // If the turn has changed, update the UI
    if (previousTurn !== this.gameState.currentTurn) {
      console.log(`Turn changed from ${previousTurn} to ${this.gameState.currentTurn}`);
      
      // Highlight the current player
      if (this.gameState.currentTurn) {
        this.highlightCurrentPlayer(this.gameState.currentTurn);
      }
      
      // Update my-turn state
      const isMyTurn = Number(this.gameState.currentTurn) === Number(this.currentPlayerId);
      this.setMyTurnState(isMyTurn);
      
      // Update hand display if it's my turn
      if (isMyTurn) {
        this.updateHandDisplay();
      }
    }
    
    // Update UI elements based on game state
    this.updateGamePhaseUI(this.gameState.phase);
    
    // Update round indicator if needed
    if (this.gameState.round) {
      this.updateRoundIndicator(this.gameState.round);
    }
  }
  
  handlePlayerAction(data) {
    console.log('Processing player action', data);
    
    const { playerId, username, action } = data;
    
    // Process the action based on its type
    switch (action.type) {
      case 'draw_card':
        this.handleDrawCardAction(playerId, username);
        break;
        
      case 'play_card':
        this.handlePlayCardAction(playerId, username, action.cardId);
        break;
        
      default:
        console.log('Unknown action type:', action.type);
    }
  }
  
  handleTurnChange(data) {
    console.log('Processing turn change');
    
    // Update the current turn in our game state
    this.gameState.currentTurn = data.playerId;
    
    // Highlight the current player
    this.highlightCurrentPlayer(data.playerId);
    
    // Check if it's my turn - add explicit conversion
    const isMyTurn = Number(data.playerId) === Number(this.currentPlayerId);
    console.log(`Turn change: server playerId=${data.playerId}, my playerId=${this.currentPlayerId}, isMyTurn=${isMyTurn}`);
    
    this.setMyTurnState(isMyTurn);
    
    // Show notification about whose turn it is
    this.showTurnNotification(data.username);
    
    if (isMyTurn) {
      // Add first turn handling for card interactivity
      if (!this.hasProcessedFirstTurn) {
        // First, update the display normally
        this.updateHandDisplay();
        
        // Add a short delay to ensure all elements are ready
        setTimeout(() => {
          // Force update hand display again to ensure cards are clickable
          this.updateHandDisplay();
          // Mark that we've handled the first turn
          this.hasProcessedFirstTurn = true;
          console.log("First turn processing complete, cards should be clickable now");
        }, 200);
      } else {
        // Normal processing for subsequent turns
        this.updateHandDisplay();
      }
    }
    
    if (this.gameState && this.gameState.currentTurn) {
      // Update highlighting based on whose turn it is now
      setTimeout(() => {
        // Small delay to ensure other processes complete first
        this.highlightCurrentPlayer(this.gameState.currentTurn);
      }, 300);
    }
  }

  handleRoundResult(data) {
    console.log(`Round result received: ${data.winnerName} won ${data.cardCount} cards`);
    
    // Update game state from server data
    this.gameState.round = data.newRound;
    
    // Clear played cards (UI only)
    this.playedCards = {};
    
    // Clear card slots
    this.clearCardSlots();
    
    // Show notification
    this.showNotification(`${data.winnerName} wins the round and takes ${data.cardCount} cards!`, "winner");
  }

  handleRestartGame() {
    console.log('Game restarted');
    
    // Clear any game end UI
    const resultsOverlay = document.querySelector('.results-overlay');
    if (resultsOverlay) {
      resultsOverlay.remove();
    }
    
    // Reset local game state
    this.clearTable();
    this.updateGamePhaseUI('playing');
    
    // Clear hands and played cards locally
    this.hands = {};
    this.playedCards = {};
    
    // Request updated game state
    this.sendWebSocketMessage({ 
      type: 'game_state_request', 
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    // Request connected users
    this.sendWebSocketMessage({ 
      type: 'connected_users', 
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    this.showNotification('Game restarted! Enjoy!', 'success');
  }

  handleRedirectToLobby(_data) {
    console.log('Received redirect to lobby message from server');
    
    // Only redirect if not already navigating
    if (sessionStorage.getItem('intentionalNavigation') !== 'true') {
      // Set navigation flags
      sessionStorage.setItem('intentionalNavigation', 'true');
      sessionStorage.setItem('wsWasOpen', 'true');
      
      // Navigate to games page with a small delay
      setTimeout(() => {
        globalThis.location.href = 'games.html';
      }, 10);
    }
  }
  
  handleError(data) {
    console.error('Game error:', data.message);
    
    // Show error to user
    this.showErrorNotification(data.message);
  }
  
  // Helper method to send WebSocket messages
  sendWebSocketMessage(message) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message - WebSocket not connected');
    }
  }
  
  initializeHands() {
    console.log('Hand initialization is now handled by the server');
    
    // The hands data should be coming from the server
    // We'll just update the UI based on that data
    this.updateHandDisplay();
  }
  
  // Update hand display
  updateHandDisplay() {
    // Only update if we have the current player's hand
    if (!this.currentPlayerId || !this.hands[this.currentPlayerId]) {
      return;
    }
    
    const handContainer = this.uiElements.handContainer;
    if (!handContainer) {
      console.warn('Hand container not found');
      return;
    }
    
    // Clear current hand
    handContainer.innerHTML = '';
    
    // Get the current player's hand
    const hand = this.hands[this.currentPlayerId];
    
    // Calculate card positioning
    const cardWidth = 80; // Width of each card in pixels
    const containerWidth = handContainer.offsetWidth;
    const totalCards = hand.length;
    
    // Calculate overlap for cards
    let overlapOffset = Math.min(60, (containerWidth - cardWidth) / (totalCards - 1));
    if (totalCards <= 1) overlapOffset = 0;
    
    // Calculate start position
    const totalWidth = cardWidth + (totalCards - 1) * overlapOffset;
    const startPosition = (containerWidth - totalWidth) / 2;
    
    // Add each card to the display
    hand.forEach((card, index) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'hand-card';
      cardElement.dataset.cardId = card.id;
      
      // IMPORTANT CHANGE: Get full card data including picture from cardsById
      const fullCardData = this.cardsById[card.id];
      
      // Create card image using the full card data
      const cardImage = document.createElement('img');
      cardImage.src = fullCardData ? fullCardData.picture : card.picture; // Try fullCardData first, fallback to card.picture
      cardImage.alt = `${card.rank} of ${card.suit}`;
      cardImage.className = 'card-image';
      
      // Add the image to the card
      cardElement.appendChild(cardImage);
      
      // Position the card
      const position = startPosition + index * overlapOffset;
      cardElement.style.left = `${position}px`;
      cardElement.style.zIndex = index;
      
      // Add click handler if it's the player's turn
      if (this.isMyTurn()) {
        cardElement.classList.add('playable');
        
        // Use a clear click handler for each card
        cardElement.addEventListener('click', () => {
          console.log(`Clicked on card ${card.id} (${card.rank} of ${card.suit})`);
          // Play the clicked card
          this.playCard(card.id);
        });
      }
      
      // Add to hand container
      handContainer.appendChild(cardElement);
    });
    
    // Broadcast hand size update
    this.sendWebSocketMessage({
      type: 'player_hand_update',
      username: this.currentUsername,
      cardCount: hand.length,
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
  }

  updateProfilesContainer(users) {
    // Get the profiles container
    const profilesContainer = document.getElementById('profiles');
    if (!profilesContainer) return;
    
    // Clear existing profiles
    profilesContainer.innerHTML = '';
    
    // Add each user to the profiles container
    users.forEach(user => {
        // Create profile box
        const profileBox = document.createElement('div');
        profileBox.className = 'profile-box';
        profileBox.dataset.username = user.username;
        
        // Create profile picture
        const profilePic = document.createElement('img');
        profilePic.className = 'profile-picture';
        profilePic.alt = user.username;
        
        // Use provided profile picture or default
        if (user.pp_path && user.pp_path.trim() !== '') {
            profilePic.src = user.pp_path;
        } else {
            profilePic.src = 'profile_pictures/default.jpg';
        }
        
        // Create profile name
        const profileName = document.createElement('div');
        profileName.className = 'profile-name';
        profileName.textContent = user.username;
        
        // Add connection status indicator if needed
        if (user.connected === false) {
            profileBox.classList.add('disconnected');
            profilePic.style.opacity = '0.5';
        }
        
        // Add highlight for current user
        if (user.username === this.currentUsername) {
            profileBox.classList.add('current-user');
        }
        
        // Add click event to redirect to profile
        profileBox.addEventListener('click', () => {
            goToProfilePage(user.username);
        });
        
        // Assemble profile box
        profileBox.appendChild(profilePic);
        profileBox.appendChild(profileName);
        profilesContainer.appendChild(profileBox);
    });
  }
  
  isMyTurn() {
    // If game is not in playing phase, return false
    if (this.gameState.phase !== 'playing') {
      console.log('Not in playing phase');
      return false;
    }
    
    // If no current turn set, don't allow playing
    if (!this.gameState.currentTurn) {
      console.log('No current turn set');
      return false;
    }
    
    // Add more robust type conversion to handle string vs number comparison
    const currentTurn = Number(this.gameState.currentTurn);
    const currentPlayerId = Number(this.currentPlayerId);
    
    if (isNaN(currentTurn) || isNaN(currentPlayerId)) {
      console.log('Invalid turn or player ID format');
      return false;
    }
    
    // For debugging
    console.log(`Turn check: currentTurn=${currentTurn}, currentPlayerId=${currentPlayerId}`);
    
    // Compare as numbers
    return currentTurn === currentPlayerId;
  }
  
  playCard(cardId) {
    // Check if it's the player's turn
    if (!this.isMyTurn()) {
      this.showNotification("It's not your turn to play");
      return;
    }
    
    // Add a flag to prevent double-handling
    if (this._isProcessingCardId === cardId) {
      console.log(`Already processing card ${cardId}, ignoring duplicate action`);
      return;
    }
    
    // Set the flag
    this._isProcessingCardId = cardId;
    
    // Send the action to the server but don't modify local state
    // The server will broadcast updates to all clients
    this.sendWebSocketMessage({
      type: 'player_action',
      action: {
        type: 'play_card',
        cardId
      },
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    // Clear the flag after a short delay
    setTimeout(() => {
      this._isProcessingCardId = null;
    }, 500);
  }
  
  handleDrawCardAction(_playerId, username) {
    console.log(`Player ${username} drew a card`);
    
    // Show notification only
    this.showNotification(`${username} drew a card`);
    
    // The actual card should arrive in a game state update from the server
    // We'll update the UI when that happens
  }
  
  handlePlayCardAction(playerId, username, cardId) {
    console.log(`Player ${username} played card ${cardId}`);
    
    // Get the full card data from our local cache
    const card = this.cardsById[cardId];
    if (!card) {
      console.warn(`Card data not found for ID ${cardId}`);
      return;
    }
    
    // Create a unique animation key
    const animationKey = `card-play-${playerId}-${cardId}`;
    
    // Only add to played cards if not already there
    if (!this.playedCards[playerId]) {
      console.log(`Adding card ${cardId} to played cards for player ${playerId}`);
      this.playedCards[playerId] = card;
      
      // Update the card slot with the played card
      this.updateCardSlot(playerId, card);
      
      // For the player who played the card, update hand if needed
      if (String(playerId) === String(this.currentPlayerId)) {
        const playerHand = this.hands[playerId];
        if (playerHand) {
          const cardIndex = playerHand.findIndex(c => Number(c.id) === Number(cardId));
          if (cardIndex !== -1) {
            console.log(`Removing card ${cardId} from hand (if not already removed)`);
            playerHand.splice(cardIndex, 1);
            this.updateHandDisplay();
          }
        }
      }
      
      // Only animate from parent class if this is not a WarGame instance
      // AND no animation is already in progress
      if (this.constructor.name !== 'WarGame' && !this._animationsInProgress[animationKey]) {
        const isOpponent = String(playerId) !== String(this.currentPlayerId);
        
        // Mark this animation as in progress
        this._animationsInProgress[animationKey] = true;
        console.log(`BASE: Animation started for ${animationKey}`);
        
        this.animateCardPlay(card, false, isOpponent);
        
        // Clear the animation flag after animation completes
        setTimeout(() => {
          delete this._animationsInProgress[animationKey];
          console.log(`BASE: Animation completed for ${animationKey}`);
        }, 1000); // Adjust timeout based on animation duration
      }
      
      // Show notification
      this.showNotification(`${username} played a card`);
    } else {
      console.log(`Card ${cardId} already recorded for player ${playerId}, skipping duplicate handling`);
    }
  }
  
  isAnimationInProgress(key) {
    return !!this._animationsInProgress[key];
  }

  setAnimationInProgress(key, timeout = 1000) {
    this._animationsInProgress[key] = true;
    
    // Auto-clear after timeout
    setTimeout(() => {
      delete this._animationsInProgress[key];
    }, timeout);
    
    return true;
  }
  
  // Basic animation for a card play - to be overridden by subclasses
  animateCardPlay(card, specialEffect = false, isOpponent = false) {
    console.log(`PARENT: animateCardPlay called for card ${card.id}`);
    // Create a temporary element for the animation
    const animatedCard = document.createElement('div');
    animatedCard.className = 'animated-card';
    
    // Get responsive dimensions
    const cardDimensions = this.getCardDimensions();
    
    // Set styles
    animatedCard.style.position = 'absolute';
    animatedCard.style.width = cardDimensions.width;
    animatedCard.style.height = cardDimensions.height;
    animatedCard.style.zIndex = '2000'; // Higher z-index to appear above card stacks
    animatedCard.style.transition = 'all 0.5s ease';
    animatedCard.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
    
    // Add card image
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardImage.style.width = '100%';
    cardImage.style.height = '100%';
    cardImage.style.borderRadius = '8px';
    
    animatedCard.appendChild(cardImage);
    
    // Set starting positions based on player source
    if (isOpponent) {
      // For opponent cards - come from top
      const opponentStack = document.getElementById('opponentCardStack');
      if (opponentStack) {
        const rect = opponentStack.getBoundingClientRect();
        animatedCard.style.top = `${rect.top + rect.height/2}px`;
        animatedCard.style.left = `${rect.left + rect.width/2}px`;
      } else {
        animatedCard.style.top = '80px';
      }
      animatedCard.style.bottom = 'auto';
    } else {
      // For player cards - come from bottom
      const playerStack = document.getElementById('playerCardStack');
      if (playerStack) {
        const rect = playerStack.getBoundingClientRect();
        animatedCard.style.bottom = `${globalThis.innerHeight - rect.bottom - rect.height/2}px`;
        animatedCard.style.left = `${rect.left + rect.width/2}px`;
      } else {
        animatedCard.style.bottom = '150px';
      }
      animatedCard.style.top = 'auto';
    }
    
    animatedCard.style.transform = 'translateX(-50%)';
    
    // Add to document
    document.body.appendChild(animatedCard);
    
    // Determine destination
    setTimeout(() => {
      // Move to destination
      if (specialEffect) {
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
      }, specialEffect ? 800 : 500);
    }, 10);
  }

  // Animation helper for subclasses to override
  animateCardToPosition(animatedCard, _card, specialEffect, _isOpponent) {
    // Default implementation for generic card animation
    setTimeout(() => {
      // Default animation to center
      animatedCard.style.top = 'calc(50% - 90px)';
      
      if (specialEffect) {
        animatedCard.style.transform = 'translate(-50%, 0) scale(1.2)';
        animatedCard.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.5)';
      }
      
      // Remove after animation
      setTimeout(() => {
        animatedCard.remove();
      }, 500);
    }, 10);
  }

  // Generic placeholder for updateCardSlot - to be implemented by subclasses
  updateCardSlot(_playerId, _card) {
    console.log('Base updateCardSlot - override in subclass');
    // Base class just logs the event - subclasses should override this
  }

  // Generic placeholder for clearCardSlots - to be implemented by subclasses
  clearCardSlots() {
    console.log('Base clearCardSlots - override in subclass');
    // Base class just logs the event - subclasses should override this
  }
  
  // Generic placeholder for clearTable - to be implemented by subclasses
  clearTable() {
    console.log('Base clearTable - override in subclass');
    // This should be overridden by subclasses
    this.clearCardSlots();
  }
  
  endGame(winnerId, winnerName) {
    console.log(`Game ended, winner: ${winnerName}`);
    
    // Update UI state only
    this.gameState.phase = 'finished';
    this.updateGamePhaseUI('finished');
    
    // Show game over notification
    this.showNotification(`Game Over! ${winnerName} wins!`, 'gameOver');
    
    // Show game results UI
    this.showGameResults(winnerId, winnerName);
  }
  
  // Basic placeholder for implementing in subclasses
  highlightCurrentPlayer(playerId) {
    // Implementation will be provided in subclasses
    console.log(`Highlighting player with ID ${playerId}`);
  }
  
  setMyTurnState(isMyTurn) {
    // UI-only function that visually indicates turn state
    // This doesn't affect game logic - just updates the display
    
    if (isMyTurn) {
      document.body.classList.add('my-turn');
      console.log('UI updated: It is now my turn');
    } else {
      document.body.classList.remove('my-turn');
      console.log('UI updated: Not my turn');
    }
  }
  
  // ====================== UI METHODS ======================
  initPokerTable() {
    // Implementation will vary by game type
    console.log('Initializing poker table UI');
  }
  
  initChatToggle() {
    // Create chat toggle button if it doesn't exist
    const chatToggle = document.getElementById('chatToggle') || document.createElement('div');
    
    // If we created a new element, set its properties
    if (!chatToggle.id) {
      chatToggle.className = 'chat-toggle';
      chatToggle.id = 'chatToggle';
      document.body.appendChild(chatToggle);
      
      // Add notification dot
      const notificationDot = document.createElement('div');
      notificationDot.className = 'chat-notification-dot';
      notificationDot.id = 'chatNotificationDot';
      chatToggle.appendChild(notificationDot);
    } else {
      // Make sure the notification dot exists
      if (!document.getElementById('chatNotificationDot')) {
        const notificationDot = document.createElement('div');
        notificationDot.className = 'chat-notification-dot';
        notificationDot.id = 'chatNotificationDot';
        chatToggle.appendChild(notificationDot);
      }
    }
    
    // Store reference
    this.uiElements.chatToggle = chatToggle;
    this.uiElements.chatNotificationDot = document.getElementById('chatNotificationDot');
    
    // Check if chat container exists
    if (!this.uiElements.chatContainer) {
      this.uiElements.chatContainer = document.querySelector('.container');
      console.log("Chat container initialized:", this.uiElements.chatContainer);
    }
    
    // Initialize chat state to hidden by default
    sessionStorage.setItem('chatHidden', 'true');
    if (this.uiElements.chatContainer) {
      this.uiElements.chatContainer.classList.add('chat-hidden');
      chatToggle.classList.add('chat-hidden');
    }
    
    // Add event listener with better error handling
    chatToggle.addEventListener('click', () => {
      console.log("Chat toggle clicked");
      if (this.uiElements.chatContainer) {
        this.uiElements.chatContainer.classList.toggle('chat-hidden');
        chatToggle.classList.toggle('chat-hidden');
        
        // Hide notification dot when opening chat
        if (!this.uiElements.chatContainer.classList.contains('chat-hidden') && 
            this.uiElements.chatNotificationDot) {
          this.uiElements.chatNotificationDot.style.display = 'none';
        }
        
        // Save state to sessionStorage
        const isHidden = this.uiElements.chatContainer.classList.contains('chat-hidden');
        sessionStorage.setItem('chatHidden', isHidden.toString());
        console.log("Chat visibility toggled:", isHidden ? "hidden" : "visible");
      } else {
        console.error("Chat container not found");
      }
    });
  }
  
  toggleChat() {
    if (!this.uiElements.chatContainer || !this.uiElements.chatToggle) return;
    
    // Toggle classes
    this.uiElements.chatContainer.classList.toggle('chat-hidden');
    this.uiElements.chatToggle.classList.toggle('chat-hidden');
    
    // Hide notification dot when opening chat
    if (!this.uiElements.chatContainer.classList.contains('chat-hidden') && 
        this.uiElements.chatNotificationDot) {
      this.uiElements.chatNotificationDot.style.display = 'none';
    }
    
    // Save state to sessionStorage
    const isHidden = this.uiElements.chatContainer.classList.contains('chat-hidden');
    sessionStorage.setItem('chatHidden', isHidden.toString());
  }
  
  initChatInput() {
    if (!this.uiElements.messageInput) return;
    
    this.uiElements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });
    
    // Fix the button
    const sendButton = document.querySelector('.input-area button');
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendChatMessage());
    }
  }
  
  sendChatMessage() {
    if (!this.uiElements.messageInput) return;
    
    const message = this.uiElements.messageInput.value.trim();
    if (!message) return;
    
    this.sendWebSocketMessage({
      type: 'chat_message',
      message,
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    
    this.uiElements.messageInput.value = '';
  }
  
  updateTablePlayers(_players, _currentUsername) {
    // Implementation will vary by game type
    console.log('Updating table players UI');
  }
  
  updateGamePhaseUI(phase) {
    // Remove any existing phase classes
    document.body.classList.remove('phase-waiting', 'phase-setup', 'phase-playing', 'phase-finished');
    
    // Add the current phase class
    document.body.classList.add(`phase-${phase}`);
    
    // Hide start game button when game is playing
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
      startGameBtn.style.display = phase === 'playing' ? 'none' : 'block';
    }
    
    // Update round indicator visibility (will be handled by CSS)
    const roundIndicator = document.getElementById('roundIndicator');
    if (roundIndicator && phase === 'playing') {
      // Ensure the round indicator is updated with current round when becoming visible
      if (this.gameState && this.gameState.round) {
        roundIndicator.textContent = `Round ${this.gameState.round}`;
      }
    }
    
    // Show phase notification
    switch (phase) {
      case 'waiting':
        this.showNotification('Waiting for players to join...');
        break;
      case 'setup':
        this.showNotification('Game is being set up...');
        break;
      case 'playing':
        break;
      case 'finished':
        this.showNotification('Game has ended');
        break;
    }
  }
  
  updateRoundIndicator(round) {
    // Create or update round indicator
    let roundIndicator = document.getElementById('roundIndicator');
    if (!roundIndicator) {
      roundIndicator = document.createElement('div');
      roundIndicator.id = 'roundIndicator';
      roundIndicator.className = 'round-indicator';
      document.body.appendChild(roundIndicator);
    }
    
    roundIndicator.textContent = `Round ${round}`;
  }
  
  showGameResults(winnerId, winnerName) {
    console.log(`Showing game results - winner: ${winnerName} (ID: ${winnerId})`);
    
    // Remove any existing results overlay
    const existingOverlay = document.querySelector('.results-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // Create a results overlay
    const resultsOverlay = document.createElement('div');
    resultsOverlay.className = 'results-overlay';
    
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'results-container';
    
    const resultsTitle = document.createElement('h2');
    resultsTitle.textContent = 'Game Results';
    
    const resultsList = document.createElement('div');
    resultsList.className = 'results-list';
    
    // Add player results
    this.players.forEach(player => {
      const playerResult = document.createElement('div');
      playerResult.className = 'player-result';
      
      const playerName = document.createElement('div');
      playerName.className = 'player-name';
      playerName.textContent = player.username;
      
      const playerHandSize = this.hands[player.id] ? this.hands[player.id].length : 0;
      const playerScore = document.createElement('div');
      playerScore.className = 'player-score';
      playerScore.textContent = `Cards: ${playerHandSize}`;
      
      // Highlight winner
      if (String(player.id) === String(winnerId)) {
        playerName.textContent += ' (Winner!)';
      }
      
      playerResult.appendChild(playerName);
      playerResult.appendChild(playerScore);
      resultsList.appendChild(playerResult);
    });
    
    // Create button container for better styling
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'result-buttons';
    
    // Add "Play Again" button
    const playAgainButton = document.createElement('button');
    playAgainButton.textContent = 'Play Again';
    playAgainButton.className = 'play-again-button';
    playAgainButton.addEventListener('click', () => this.restartGame());
    
    // Add button to return to lobby
    const returnButton = document.createElement('button');
    returnButton.textContent = 'Return to Lobby';
    returnButton.className = 'return-button';
    returnButton.addEventListener('click', () => this.returnToLobby());
    
    // Add buttons to container
    buttonContainer.appendChild(playAgainButton);
    buttonContainer.appendChild(returnButton);
    
    // Assemble the results view
    resultsContainer.appendChild(resultsTitle);
    resultsContainer.appendChild(resultsList);
    resultsContainer.appendChild(buttonContainer);
    resultsOverlay.appendChild(resultsContainer);
    
    // Add to document
    document.body.appendChild(resultsOverlay);
    
    // Hide start game button if visible
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
      startGameBtn.style.display = 'none';
    }
  }

  async restartGame() {
    try {
      // Show loading state
      this.showNotification('Restarting game...', 'info');
      
      // Call the backend to restart the game
      const response = await fetch(appConfig.apiEndpoint('/restart-game'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ gameId: this.currentGameId }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restart game');
      }
      
      // Close the results overlay
      const resultsOverlay = document.querySelector('.results-overlay');
      if (resultsOverlay) {
        resultsOverlay.remove();
      }
      
      // Show success message
      this.showNotification('Game restarted! Waiting for server update...', 'success');
      
      // Clear game state locally
      this.gameState.phase = 'waiting';
      this.gameState.round = 1;
      this.updateGamePhaseUI('waiting');
      this.hands = {};
      this.playedCards = {};
      
      // Request updated game state
      this.sendWebSocketMessage({
        type: 'game_state_request',
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
      
    } catch (error) {
      console.error('Error restarting game:', error);
      this.showErrorNotification('Error restarting game: ' + error.message);
    }
  }
  
  showNotification(message, type = 'info') {
    // Create notification if it doesn't exist
    let notification = document.getElementById('gameNotification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'gameNotification';
      notification.className = 'game-notification';
      document.body.appendChild(notification);
    }
    
    // Set notification content and type
    notification.textContent = message;
    notification.className = `game-notification ${type}`;
    
    // Show the notification
    notification.classList.add('show');
    
    // Hide after timeout
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
  
  showErrorNotification(message) {
    this.showNotification(message, 'error');
  }
  
  showTurnNotification(username) {
    // Customize the message based on whether it's the current player's turn
    const message = username === this.currentUsername
      ? "It's your turn!"
      : `It's ${username}'s turn`;
    
    this.showNotification(message, 'turn');
  }
  
  // ====================== EVENT LISTENERS ======================
  setupEventListeners() {
    // Attach event listener to Back to Lobby button
    const lobbyButton = document.getElementById('backToLobbyBtn');
    if (lobbyButton) {
      lobbyButton.addEventListener('click', () => this.returnToLobby());
    }
    
    // Attach event listener to Start Game button 
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => this.startGame());
    }
  }
  
  returnToLobby() {
    // Set a navigation flag that will be checked by other scripts
    sessionStorage.setItem('intentionalNavigation', 'true');
    sessionStorage.setItem('wsWasOpen', 'true');
    
    // Send a message to the server to redirect all players if game is finished
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN && 
        this.currentGameId && this.gameState && this.gameState.phase === 'finished') {
      this.sendWebSocketMessage({
        type: 'redirect_to_lobby',
        gameId: this.currentGameId,
        auth_token: localStorage.getItem('auth_token')
      });
      console.log('Sent redirect request to server for all players');
    }
    
    // Small delay to ensure sessionStorage is updated before navigation
    setTimeout(() => {
      // Navigate to games page
      globalThis.location.href = 'games.html';
    }, 100);
  }

  startGame() {
    console.log('Start game button clicked');
    
    // Get the game ID from sessionStorage
    const gameId = this.currentGameId || sessionStorage.getItem('currentGameId');
    if (!gameId) {
      this.showErrorNotification('No active game found');
      return;
    }
    
    // Check if this is a war game and enforce the 2-player requirement
    if (this.constructor.name === 'WarGame') {
      console.log('War game detected, checking player count');
      if (this.players.length !== 2) {
        this.showErrorNotification('War game requires exactly 2 players to start');
        return;
      }
    } else if (this.players.length < 2) {
      // For other game types, just check minimum player count
      this.showErrorNotification('Game requires at least 2 players to start');
      return;
    }
    
    // Show loading state
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting...';
    }
    
    // Call the backend API directly
    fetch(appConfig.apiEndpoint('/start-game'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ gameId: parseInt(gameId, 10) }),
      credentials: 'include'
    })
    .then(response => {
      console.log('Start game response status:', response.status);
      
      if (!response.ok) {
        return response.json().then(err => {
          throw new Error(err.error || 'Failed to start game');
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Game started successfully:', data);
      
      // Instead of reloading the page, we'll request game state update via WebSocket
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        
        // Request updated game state
        this.sendWebSocketMessage({
          type: 'game_state_request',
          gameId: gameId,
          auth_token: localStorage.getItem('auth_token')
        });
        
        // Hide the start button
        if (startBtn) {
          startBtn.style.display = 'none';
        }
        
        // Show success message
        this.showNotification('Game started! Waiting for server update...', 'success');
      } else {
        // If WebSocket isn't available, set intentional navigation flag and reload
        console.log('WebSocket not available, using page reload');
        sessionStorage.setItem('intentionalNavigation', 'true');
        sessionStorage.setItem('wsWasOpen', 'true');
        
        // Reload after a small delay
        setTimeout(() => {
          globalThis.location.reload();
        }, 100);
      }
    })
    .catch(error => {
      console.error('Error starting game:', error);
      this.showErrorNotification('Error starting game: ' + error.message);
      
      // Reset button state
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Game';
      }
    });
  }
  
  // ====================== UTILITY FUNCTIONS ======================
  goToLogin() {
    localStorage.removeItem('auth_token');
    globalThis.location.href = 'login.html';
  }

  logDebug(message, ...args) {
    console.log(`[CardGame] ${message}`, ...args);
  }
  
  logError(message, error) {
    console.error(`[CardGame] ${message}`, error);
    // Show error notification to user
    this.showErrorNotification(`Error: ${message}. See console for details.`);
  }
  
  // Add a public method to check status
  getStatus() {
    return {
      initialized: this.componentsInitialized,
      cardsLoaded: this.cardsLoaded,
      websocketConnected: this.websocket && this.websocket.readyState === WebSocket.OPEN,
      gameId: this.currentGameId,
      playerId: this.currentPlayerId,
      username: this.currentUsername,
      playerCount: this.players.length,
      gamePhase: this.gameState.phase
    };
  }

  getCardDimensions() {
    // Try to get dimensions from an existing card slot or stack
    const slot = document.querySelector('.war-card-slot');
    if (slot) {
      const rect = slot.getBoundingClientRect();
      return {
        width: `${rect.width}px`,
        height: `${rect.height}px`
      };
    }
    
    // Fallback to stack dimensions
    const stack = document.querySelector('.war-card-stack');
    if (stack) {
      const rect = stack.getBoundingClientRect();
      return {
        width: `${rect.width}px`,
        height: `${rect.height}px`
      };
    }
    
    // Fallback based on viewport width for responsive sizing
    const vw = Math.max(document.documentElement.clientWidth || 0, globalThis.innerWidth || 0);
    
    if (vw <= 480) { // Small screens
      return { width: '3.5rem', height: '5rem' };
    } else if (vw <= 768) { // Medium screens
      return { width: '4.5rem', height: '6.5rem' };
    } else if (vw <= 1200) { // Large screens
      return { width: '5.5rem', height: '7.75rem' };
    } else { // Extra large screens
      return { width: '6rem', height: '8.5rem' };
    }
  }

}


// Function to navigate to profile page
function goToProfilePage(username) {
  // Track that user is coming from index page
  sessionStorage.setItem('profileOrigin', 'index');
  sessionStorage.setItem('intentionalNavigation', 'true');
  sessionStorage.setItem('wsWasOpen', 'true');
  
  // Store the username to view
  sessionStorage.setItem('profileToView', username);
  
  setTimeout(() => {
      globalThis.location.href = 'profile.html';
  }, 10);
}

// Make globally available
globalThis.CardGameFramework = CardGameFramework;
globalThis.goToProfilePage = goToProfilePage;
// For chat message sending
globalThis.sendJson = function() {
  if (globalThis.cardGame) {
    globalThis.cardGame.sendChatMessage();
  }
};