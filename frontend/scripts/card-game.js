// card-game.js - Base Card Game Framework

class CardGameFramework {
  constructor(options = {}) {
    // Game state
    this.websocket = null;
    this.currentGameId = null;
    this.currentPlayerId = null;
    this.currentUsername = null;
    this.players = [];
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
      const response = await fetch('http://localhost:3000/api/cards');
      
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
      const response = await fetch('http://localhost:3000/active-game', {
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
    
    console.log('Game components initialized');
  }
  
  // ====================== WEBSOCKET HANDLING ======================
  connectWebSocket() {
    try {
      console.log('Attempting to connect WebSocket...');
      // Add the auth token to the URL for authentication
      const authToken = localStorage.getItem('auth_token');
      // Use explicit protocol and full URL with token as query parameter
      this.websocket = new WebSocket(`ws://localhost:3000/?token=${encodeURIComponent(authToken)}`);
      
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

  // Add after connectWebSocket() method
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
  
  handleWebSocketOpen(event) {
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
  
  handlePageUnload(event) {
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
      navigator.sendBeacon(
        `http://localhost:3000/disconnect-from-game?auth_token=${encodeURIComponent(authToken)}`
      );
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
    
    // Store the players
    this.players = users;
    
    // Find this player in the players array and set currentPlayerId
    const currentPlayer = this.players.find(p => p.username === this.currentUsername);
    if (currentPlayer && currentPlayer.id) {
      this.currentPlayerId = currentPlayer.id;
      console.log(`Set current player ID to: ${this.currentPlayerId}`);
    }
    
    // Update the poker table players
    this.updateTablePlayers(users, this.currentUsername);
    
    // Initialize player hands if not already done
    if (Object.keys(this.hands).length === 0 && this.gameState.phase === 'playing') {
      this.initializeHands();
    }
  }
  
// Replace in card-game.js

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
        // This is the key fix - handle card actions from other players
        // Make sure this executes for BOTH your own actions and others' actions
        this.handlePlayCardAction(playerId, username, action.cardId);
        break;
        
      case 'play_war_cards':
        this.handlePlayWarCardsAction(playerId, username, action.count);
        break;
        
      default:
        console.log('Unknown action type:', action.type);
    }
  }
  
  // Add this to the handleTurnChange method in card-game.js
  handleTurnChange(data) {
    console.log('Processing turn change');
    
    // Update the current turn in our game state
    this.gameState.currentTurn = data.playerId;
    
    // Highlight the current player
    this.highlightCurrentPlayer(data.playerId);
    
    // Check if it's my turn
    const isMyTurn = Number(data.playerId) === Number(this.currentPlayerId);
    this.setMyTurnState(isMyTurn);
    
    // Show notification about whose turn it is
    this.showTurnNotification(data.username);
    
    if (isMyTurn) {
      this.updateHandDisplay();
    }
  }

// In card-game.js, update the handleRoundResult method

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
  
  // Update scoreboard after a short delay (to receive updated hand sizes)
  setTimeout(() => this.updateScoreboard(), 500);
  
  // Add this line to request fresh game state from server
  setTimeout(() => {
    this.sendWebSocketMessage({
      type: 'game_state_request',
      gameId: this.currentGameId,
      auth_token: localStorage.getItem('auth_token')
    });
    console.log('Requesting updated game state after round result');
  }, 700); // Wait a bit longer than the scoreboard update
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
    let overlapOffset = Math.min(40, (containerWidth - cardWidth) / (totalCards - 1));
    if (totalCards <= 1) overlapOffset = 0;
    
    // Calculate start position
    const totalWidth = cardWidth + (totalCards - 1) * overlapOffset;
    const startPosition = (containerWidth - totalWidth) / 2;
    
    // Add each card to the display
    hand.forEach((card, index) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'hand-card';
      cardElement.dataset.cardId = card.id;
      
      // Create card image
      const cardImage = document.createElement('img');
      cardImage.src = card.picture;
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
  
  isMyTurn() {
    // This function is purely for UI purposes - determining if the current player can interact
    // It doesn't modify game state, just reads from the state sent by the server
    
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
  
  handleDrawCardAction(playerId, username) {
    console.log(`Player ${username} drew a card`);
    
    // REMOVED: Logic for checking deck size and drawing cards
    
    // Show notification only
    this.showNotification(`${username} drew a card`);
    
    // The actual card should arrive in a game state update from the server
    // We'll update the UI when that happens
  }
  
  handlePlayCardAction(playerId, username, cardId) {
    console.log(`Player ${username} played card ${cardId}`);
    
    // Get the card data
    const cardData = this.cardsById[cardId];
    if (!cardData) {
      console.warn(`Card data not found for ID ${cardId}`);
      return;
    }
    
    // Only add to played cards if not already there
    if (!this.playedCards[playerId]) {
      console.log(`Adding card ${cardId} to played cards for player ${playerId}`);
      this.playedCards[playerId] = cardData;
      
      // Update the card slot with the played card
      this.updateCardSlot(playerId, cardData);
      
      // For the player who played the card, update hand if needed
      if (String(playerId) === String(this.currentPlayerId)) {
        const playerHand = this.hands[playerId];
        if (playerHand) {
          const cardIndex = playerHand.findIndex(card => Number(card.id) === Number(cardId));
          if (cardIndex !== -1) {
            console.log(`Removing card ${cardId} from hand (if not already removed)`);
            playerHand.splice(cardIndex, 1);
            this.updateHandDisplay();
          }
        }
      }
      
      // Show animation for all players
      this.animateCardPlay(cardData);
      
      // Show notification
      this.showNotification(`${username} played a card`);
      
      // REMOVED: Logic that called this.advanceTurn() or this.resolveRound()
    } else {
      console.log(`Card ${cardId} already recorded for player ${playerId}, skipping duplicate handling`);
    }
  }

  handlePlayWarCardsAction(playerId, username, count) {
    console.log(`Player ${username} played ${count} war cards`);
    
    // REMOVED: Logic for removing cards from player hand
    // Now we only handle displaying the animation
    
    // Create container for war cards animation
    const warContainer = document.createElement('div');
    warContainer.className = 'war-cards-container';
    warContainer.style.position = 'absolute';
    warContainer.style.zIndex = '100';
    
    // Position based on player
    if (playerId === this.currentPlayerId) {
      warContainer.style.bottom = '200px';
    } else {
      warContainer.style.top = '200px';
    }
    
    warContainer.style.left = '50%';
    warContainer.style.transform = 'translateX(-50%)';
    
    // For animation purposes only
    const faceDownCards = Array(count).fill(null);
    
    // Add each card with a slight offset
    faceDownCards.forEach((_, index) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'war-card';
      cardElement.style.position = 'absolute';
      cardElement.style.left = `${index * 20}px`;
      cardElement.style.zIndex = index;
      
      // Show card back for all but last card
      const cardImage = document.createElement('img');
      cardImage.src = this.cardsById[54].picture; // Card back
      cardImage.alt = 'Card back';
      cardImage.className = 'card-image';
      
      cardElement.appendChild(cardImage);
      warContainer.appendChild(cardElement);
    });
    
    // Add to document
    document.body.appendChild(warContainer);
    
    // Remove after animation
    setTimeout(() => {
      warContainer.remove();
    }, 2000);
    
    // Show notification
    this.showNotification(`${username} played ${count} cards for war`);
    
    // Actual hand updates will come from server game state
  }
  
  // Animate a card being played
  animateCardPlay(card) {
    // Create a temporary element for the animation
    const animatedCard = document.createElement('div');
    animatedCard.className = 'animated-card';
    animatedCard.style.position = 'absolute';
    animatedCard.style.width = '120px';
    animatedCard.style.height = '180px';
    animatedCard.style.zIndex = '1000';
    animatedCard.style.transition = 'all 0.5s ease';
    
    // Add card image
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
    cardImage.alt = `${card.rank} of ${card.suit}`;
    cardImage.style.width = '100%';
    cardImage.style.height = '100%';
    
    animatedCard.appendChild(cardImage);
    
    // Position initially near hand
    animatedCard.style.bottom = '150px';
    animatedCard.style.left = '50%';
    animatedCard.style.transform = 'translateX(-50%)';
    
    // Add to document
    document.body.appendChild(animatedCard);
    
    // Animate to center
    setTimeout(() => {
      animatedCard.style.bottom = '50%';
      animatedCard.style.transform = 'translate(-50%, 50%)';
      
      // Remove after animation
      setTimeout(() => {
        animatedCard.remove();
      }, 500);
    }, 10);
  }
  
  endGame(winnerId, winnerName) {
    console.log(`Game ended, winner: ${winnerName}`);
    
    // Update UI state only
    this.gameState.phase = 'finished';
    this.updateGamePhaseUI('finished');
    
    // Show game over notification
    this.showNotification(`Game Over! ${winnerName} wins!`, 'gameOver');
    
    // REMOVED: Send game end message - server already knows
    
    // Show game results UI
    this.showGameResults(winnerId, winnerName);
  }
  
  // Simplified method for implementing in subclasses
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
    }
    
    // Store reference
    this.uiElements.chatToggle = chatToggle;
    
    // Check if chat container exists
    if (!this.uiElements.chatContainer) {
      this.uiElements.chatContainer = document.querySelector('.container');
      console.log("Chat container initialized:", this.uiElements.chatContainer);
    }
    
    // Initialize chat state from sessionStorage (default to visible)
    const chatHidden = sessionStorage.getItem('chatHidden') === 'true';
    if (chatHidden && this.uiElements.chatContainer) {
      this.uiElements.chatContainer.classList.add('chat-hidden');
      chatToggle.classList.add('chat-hidden');
    }
    
    // Add event listener with better error handling
    chatToggle.addEventListener('click', () => {
      console.log("Chat toggle clicked");
      if (this.uiElements.chatContainer) {
        this.uiElements.chatContainer.classList.toggle('chat-hidden');
        chatToggle.classList.toggle('chat-hidden');
        
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
  
  updateTablePlayers(players, currentUsername) {
    // Implementation will vary by game type
    console.log('Updating table players UI');
  }
  
  updateGamePhaseUI(phase) {
    // Remove any existing phase classes
    document.body.classList.remove('phase-waiting', 'phase-setup', 'phase-playing', 'phase-finished');
    
    // Add the current phase class
    document.body.classList.add(`phase-${phase}`);
    
    // Show phase notification
    switch (phase) {
      case 'waiting':
        this.showNotification('Waiting for players to join...');
        break;
      case 'setup':
        this.showNotification('Game is being set up...');
        break;
      case 'playing':
        this.showNotification('Game in progress');
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
        playerResult.classList.add('winner');
        playerName.textContent += ' (Winner!)';
      }
      
      playerResult.appendChild(playerName);
      playerResult.appendChild(playerScore);
      resultsList.appendChild(playerResult);
    });
    
    // Add button to return to lobby
    const returnButton = document.createElement('button');
    returnButton.textContent = 'Return to Lobby';
    returnButton.className = 'return-button';
    returnButton.addEventListener('click', () => {
      sessionStorage.setItem('intentionalNavigation', 'true');
      globalThis.location.href = 'games.html';
    });
    
    // Assemble the results view
    resultsContainer.appendChild(resultsTitle);
    resultsContainer.appendChild(resultsList);
    resultsContainer.appendChild(returnButton);
    resultsOverlay.appendChild(resultsContainer);
    
    // Add to document
    document.body.appendChild(resultsOverlay);
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
    // Add button for returning to lobby
    const lobbyButton = document.getElementById('backToLobbyBtn');
    if (lobbyButton) {
      lobbyButton.addEventListener('click', () => this.returnToLobby());
    } else {
      // Create one if it doesn't exist
      const button = document.createElement('button');
      button.id = 'backToLobbyBtn';
      button.className = 'back-to-lobby-btn';
      button.textContent = 'Back to Games Lobby';
      button.addEventListener('click', () => this.returnToLobby());
      document.body.appendChild(button);
    }
  }
  
  returnToLobby() {
    // Set a navigation flag that will be checked by other scripts
    sessionStorage.setItem('intentionalNavigation', 'true');
    sessionStorage.setItem('wsWasOpen', 'true');
    
    // Small delay to ensure sessionStorage is updated before navigation
    setTimeout(() => {
      // Navigate to games page
      globalThis.location.href = 'games.html';
    }, 10);
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
}

// Make globally available
globalThis.CardGameFramework = CardGameFramework;

// For chat message sending
globalThis.sendJson = function() {
  if (globalThis.cardGame) {
    globalThis.cardGame.sendChatMessage();
  }
};