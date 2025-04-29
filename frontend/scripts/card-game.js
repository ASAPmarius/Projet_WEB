// card-game.js - Base Card Game Framework
// This framework provides core functionality for building various card games

// ====================== CARD GAME FRAMEWORK ======================
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
      turnDirection: 1, // 1 for clockwise, -1 for counter-clockwise
      round: 1
    };
    
    // UI Elements
    this.uiElements = {
      cardElement: null,
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
    
    // Card collections
    this.cardCollections = {
      deck: [],
      discardPile: [],
      playArea: []
    };
    
    // Flag to track initialization status
    this.componentsInitialized = false;
    
    // Bind methods to this instance
    this.init = this.init.bind(this);
    this.connectWebSocket = this.connectWebSocket.bind(this);
    this.handleWebSocketOpen = this.handleWebSocketOpen.bind(this);
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.handleWebSocketError = this.handleWebSocketError.bind(this);
    this.handleWebSocketClose = this.handleWebSocketClose.bind(this);
    this.handlePageUnload = this.handlePageUnload.bind(this);
    
    // Initialize game when DOM is loaded
    document.addEventListener('DOMContentLoaded', this.init);
    globalThis.addEventListener('beforeunload', this.handlePageUnload);
  }
  
  // ====================== INITIALIZATION ======================
  async init() {
    try {
      // Get game ID from URL parameters or localStorage
      const urlParams = new URLSearchParams(globalThis.location.search);
      const gameIdParam = urlParams.get('gameId');
      this.currentGameId = gameIdParam || localStorage.getItem('currentGameId');
      
      // Get username from localStorage
      this.currentUsername = localStorage.getItem('currentUsername');
      
      // If we don't have a game ID, check for active game
      if (!this.currentGameId) {
        await this.checkActiveGame();
      }
      
      if (!this.currentGameId) {
        console.log('No active game found, redirecting to games page');
        globalThis.location.href = 'games.html';
        return;
      }
      
      console.log(`Initializing game UI for game ID: ${this.currentGameId}`);
      
      // Initialize UI elements
      this.initUIElements();
      
      // Setup game components with a delay to ensure DOM is ready
      setTimeout(() => {
        try {
          this.initGameComponents();
          this.componentsInitialized = true;
          console.log('Game components initialized');
          
          // Connect to WebSocket after components are initialized
          this.connectWebSocket();
        } catch (error) {
          console.error('Error initializing game components:', error);
        }
      }, 1000);
      
      // Clear navigation flags
      localStorage.removeItem('intentionalNavigation');
      localStorage.removeItem('wsWasOpen');
    } catch (error) {
      console.error('Error during game initialization:', error);
      globalThis.location.href = 'games.html';
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
        localStorage.setItem('currentGameId', this.currentGameId);
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
    this.uiElements.cardElement = document.getElementById('card');
    this.uiElements.cardStack = document.getElementById('cardStack');
    this.uiElements.chatContainer = document.querySelector('.container');
    this.uiElements.messageInput = document.getElementById('messageInput');
    this.uiElements.handContainer = document.getElementById('handContainer');
    
    console.log('UI elements initialized');
  }
  
  // Initialize game components
  initGameComponents() {
    // Create and initialize the poker table
    this.initPokerTable();
    
    // Initialize the chat toggle
    this.initChatToggle();
    
    // Initialize the chat input
    this.initChatInput();
    
    // Add card notification badge
    this.addCardNotification();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Create discard pile if it doesn't exist
    this.createDiscardPile();
    
    console.log('Game components initialized');
  }
  
  // ====================== WEBSOCKET HANDLING ======================
  connectWebSocket() {
    this.websocket = new WebSocket('ws://localhost:3000');
    
    this.websocket.onopen = this.handleWebSocketOpen;
    this.websocket.onmessage = this.handleWebSocketMessage;
    this.websocket.onerror = this.handleWebSocketError;
    this.websocket.onclose = this.handleWebSocketClose;
    
    console.log('WebSocket connection initialized');
  }
  
  handleWebSocketOpen() {
    console.log('WebSocket connection established');
    
    // Only request data if UI components are ready
    if (this.componentsInitialized) {
      console.log('UI components are ready, requesting initial data');
      this.requestUsersProfile();
      this.requestGameState();
      this.requestCard();
      this.requestHand();
    } else {
      // If components aren't ready yet, wait and then request data
      console.log('UI components not fully initialized, waiting before requesting data...');
      const checkInterval = setInterval(() => {
        if (this.componentsInitialized) {
          clearInterval(checkInterval);
          console.log('UI components now initialized, requesting data...');
          this.requestUsersProfile();
          this.requestGameState();
          this.requestCard();
          this.requestHand();
        }
      }, 200);
    }
  }
  
  handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data.type);
      
      // If the message includes a gameId, verify it matches our current game
      if (data.gameId && data.gameId != this.currentGameId) {
        console.log(`Ignoring message for different game: ${data.gameId}, our game: ${this.currentGameId}`);
        return;
      }
      
      // Handle different message types
      switch(data.type) {
        case 'message':
          this.handleChatMessage(data);
          break;
        case 'connected_users':
          this.handleConnectedUsers(data);
          break;
        case 'card_change':
          this.handleCardChange(data);
          break;
        case 'player_hand':
          this.handlePlayerHand(data);
          break;
        case 'player_hand_update':
          this.handlePlayerHandUpdate(data);
          break;
        case 'game_state':
          this.handleGameState(data);
          break;
        case 'turn_change':
          this.handleTurnChange(data);
          break;
        case 'card_played':
          this.handleCardPlayed(data);
          break;
        case 'error':
          this.handleError(data);
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
    if (localStorage.getItem('wsWasOpen') !== 'true') {
      this.goToLogin();
    }
  }
  
  handleWebSocketClose(event) {
    console.log('WebSocket connection closed:', event);
    
    // Only redirect to login if we're not navigating to another page
    if (localStorage.getItem('wsWasOpen') !== 'true') {
      this.goToLogin();
    }
  }
  
  handlePageUnload(event) {
    // Check if this is intentional navigation between our pages
    if (localStorage.getItem('intentionalNavigation') === 'true' || 
        localStorage.getItem('wsWasOpen') === 'true') {
      console.log('Intentional navigation detected, skipping disconnect');
      return;
    }
    
    // This appears to be a genuine page close/refresh
    const authToken = localStorage.getItem('auth_token');
    
    if (authToken) {
      try {
        console.log('User is leaving the page, sending disconnect signal');
        
        // Use navigator.sendBeacon instead of XHR when available (more reliable for unload events)
        if (navigator.sendBeacon) {
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          };
          
          // Create a blob with the headers
          const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
          
          // Send the beacon with the auth token in the URL as a fallback approach
          const success = navigator.sendBeacon(
            `http://localhost:3000/disconnect-from-game?auth_token=${encodeURIComponent(authToken)}`, 
            blob
          );
          
          console.log('Disconnect beacon sent:', success);
        } else {
          // Fallback to synchronous XHR
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://localhost:3000/disconnect-from-game', false); // false makes it synchronous
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
          xhr.withCredentials = true;
          xhr.send();
          
          console.log('Disconnect XHR sent');
        }
      } catch (error) {
        console.error('Failed to send disconnect signal:', error);
      }
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
    const currentUser = this.currentUsername || data.username;
    if (message.owner === currentUser) {
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
    
    // Update the user profiles sidebar
    this.updateProfilesSidebar(users);
    
    // Get current username
    this.currentUsername = data.username || this.currentUsername || localStorage.getItem('currentUsername');
    if (!this.currentUsername && data.owner) {
      this.currentUsername = data.owner;
      localStorage.setItem('currentUsername', this.currentUsername);
    }
    
    // Update the poker table players
    this.updateTablePlayers(users, this.currentUsername);
  }
  
  handleCardChange(data) {
    console.log('Processing card change');
    
    // Check if we have valid card data
    if (!data.card) {
      console.error('Invalid card data received - missing card object');
      return;
    }
    
    // Check if we have an image URL
    if (!data.card.picture) {
      console.warn('Card data has no picture URL');
    }
    
    // Use the card's picture from the database (base64 encoded)
    this.updateCardDisplay(data.card.picture, data.card.idCard);
    
    // Update the draw pile on the poker table
    this.updateDrawPileCard(data.card.picture);
    
    // Update pile count if available
    if (data.pileCount !== undefined) {
      this.updatePileCount(data.pileCount);
    }
  }
  
  handlePlayerHand(data) {
    console.log('Processing player hand update');
    
    // Store my hand
    this.myHand = data.hand || [];
    
    const handContainer = document.getElementById('handContainer');

    if (!handContainer) {
      console.error('handContainer not found in the DOM.');
      return;
    }

    // Validate hand data
    if (!data.hand || !Array.isArray(data.hand)) {
      console.error('Invalid hand data received:', data);
      return;
    }

    handContainer.innerHTML = ''; // Clear the existing hand

    const cardWidth = 80; // Width of each card
    const containerWidth = handContainer.offsetWidth; // Get the available width
    const totalCards = data.hand.length;

    // Calculate the overlap dynamically based on the number of cards
    let overlapOffset = Math.min(40, (containerWidth - cardWidth) / (totalCards - 1));
    if (totalCards === 1) overlapOffset = 0; // No overlap if there's only one card

    // Calculate the starting position for the first card
    const totalWidth = cardWidth + (totalCards - 1) * overlapOffset;
    const startPosition = (containerWidth - totalWidth) / 2;

    data.hand.forEach((card, index) => {
      // Skip invalid cards
      if (!card || !card.picture) {
        console.warn('Skipping invalid card in hand:', card);
        return;
      }
      
      const cardElement = document.createElement('div');
      cardElement.className = 'hand-card';
      cardElement.dataset.cardId = card.idCard;
      cardElement.dataset.cardType = card.cardType;
      
      // Create an image element to display the card
      const cardImage = document.createElement('img');
      cardImage.src = card.picture; // Base64 encoded image data
      cardImage.alt = `Card ${card.idCard || 'Unknown'}`;
      cardImage.className = 'card-image';
      
      // Add the image to the card element
      cardElement.appendChild(cardImage);

      // Position the card dynamically
      const position = startPosition + index * overlapOffset;
      cardElement.style.left = `${position}px`;
      cardElement.style.zIndex = index; // Ensure proper stacking order

      // Add click handler for playing cards
      cardElement.addEventListener('click', () => this.handleCardClick(card));

      handContainer.appendChild(cardElement);
    });
    
    // Update player's card count in the table view
    if (this.currentUsername && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const cardCount = data.hand.length;
      
      // Send update to server to broadcast this player's card count
      this.websocket.send(JSON.stringify({
        auth_token: localStorage.auth_token,
        type: 'player_hand_update',
        username: this.currentUsername,
        cardCount: cardCount,
        gameId: this.currentGameId
      }));
    }
  }
  
  handlePlayerHandUpdate(data) {
    console.log('Processing player hand count update');
    
    // Update the player's card count in our players array
    const playerIndex = this.players.findIndex(p => p.username === data.username);
    if (playerIndex !== -1) {
      this.players[playerIndex].cardCount = data.cardCount;
      
      // Update the table visualization
      this.updateTablePlayers(this.players, this.currentUsername);
    }
    
    // If this update is for the current player, we can optionally do something here
    if (data.username === this.currentUsername) {
      console.log('My hand count updated to:', data.cardCount);
    }
  }
  
  handleGameState(data) {
    console.log('Processing game state update');
    
    // Update the local game state
    this.gameState = data.gameState;
    
    // Update the current turn indicator
    if (this.gameState.currentTurn) {
      this.highlightCurrentPlayer(this.gameState.currentTurn);
    }
    
    // Update UI elements based on game state
    this.updateGamePhaseUI(this.gameState.phase);
    
    // Update round indicator if needed
    if (this.gameState.round) {
      this.updateRoundIndicator(this.gameState.round);
    }
  }
  
  handleTurnChange(data) {
    console.log('Processing turn change');
    
    // Update the current turn in our game state
    this.gameState.currentTurn = data.playerId;
    
    // Highlight the current player
    this.highlightCurrentPlayer(data.playerId);
    
    // If it's my turn, enable appropriate actions
    const isMyTurn = data.playerId === this.currentPlayerId;
    this.setMyTurnState(isMyTurn);
    
    // Show a notification about whose turn it is
    this.showTurnNotification(data.username);
  }
  
  handleCardPlayed(data) {
    console.log('Processing card played');
    
    // Add the card to the play area
    this.addCardToPlayArea(data.card);
    
    // Update the discard pile if applicable
    if (data.toDiscard) {
      this.updateDiscardPile(data.card);
    }
    
    // Remove the card from the player's hand if it's the current player
    if (data.playerId === this.currentPlayerId) {
      this.removeCardFromHand(data.card.idCard);
    }
    
    // Show notification about the played card
    this.showCardPlayedNotification(data.username, data.card);
  }
  
  handleError(data) {
    console.error('Game error:', data.message);
    
    // Show error to user
    this.showErrorNotification(data.message);
  }
  
  // ====================== POKER TABLE FUNCTIONALITY ======================
  initPokerTable() {
    console.log('Initializing poker table');
    
    // Check if we have the necessary elements
    if (!this.uiElements.cardStack) {
      console.warn('Original card stack not found');
      return;
    }
    
    // Create the poker table if it doesn't exist
    if (!document.getElementById('pokerTableContainer')) {
      try {
        this.createPokerTable();
        
        // Update our reference to the poker table
        this.uiElements.pokerTable = document.getElementById('pokerTableContainer');
        this.uiElements.drawPile = document.getElementById('drawPile');
        
        // Hide the original card stack
        this.hideOriginalCardStack();
      } catch (error) {
        console.error('Error creating poker table:', error);
      }
    } else {
      // Make sure our references are up to date
      this.uiElements.pokerTable = document.getElementById('pokerTableContainer');
      this.uiElements.drawPile = document.getElementById('drawPile');
    }
  }
  
  createPokerTable() {
    // Create the table container
    const pokerTable = document.createElement('div');
    pokerTable.id = 'pokerTableContainer';
    pokerTable.className = 'poker-table-container';
    
    // Create the table center area
    const tableCenter = document.createElement('div');
    tableCenter.className = 'table-center';
    
    // Create draw pile
    const drawPile = document.createElement('div');
    drawPile.id = 'drawPile';
    drawPile.className = 'draw-pile';
    
    // Create card count indicator
    const pileCount = document.createElement('div');
    pileCount.className = 'pile-count';
    pileCount.id = 'pileCount';
    pileCount.textContent = '0';
    
    // Create the card image for the draw pile
    const cardImage = document.createElement('img');
    cardImage.id = 'drawPileImage';
    cardImage.className = 'card-image';
    cardImage.style.width = '100%';
    cardImage.style.height = '100%';
    cardImage.alt = 'Card Back';
    
    // Assemble the draw pile
    drawPile.appendChild(cardImage);
    drawPile.appendChild(pileCount);
    tableCenter.appendChild(drawPile);
    pokerTable.appendChild(tableCenter);
    
    // Add the table to the document
    document.body.appendChild(pokerTable);
    
    // Add click event to the draw pile
    drawPile.addEventListener('click', () => this.handleDrawPileClick());
  }
  
  createDiscardPile() {
    // Only create if we have a poker table and don't already have a discard pile
    if (!this.uiElements.pokerTable || document.getElementById('discardPile')) {
      return;
    }
    
    // Create discard pile
    const discardPile = document.createElement('div');
    discardPile.id = 'discardPile';
    discardPile.className = 'discard-pile';
    
    // Position it next to the draw pile in the table center
    const tableCenter = this.uiElements.pokerTable.querySelector('.table-center');
    if (tableCenter) {
      // Create the card image for the discard pile
      const cardImage = document.createElement('img');
      cardImage.id = 'discardPileImage';
      cardImage.className = 'card-image';
      cardImage.style.width = '100%';
      cardImage.style.height = '100%';
      cardImage.alt = 'Discard Pile';
      cardImage.style.opacity = '0.7'; // Make it slightly transparent when empty
      
      // Create counter for discard pile
      const discardCount = document.createElement('div');
      discardCount.className = 'pile-count';
      discardCount.id = 'discardCount';
      discardCount.textContent = '0';
      
      // Add them to the discard pile
      discardPile.appendChild(cardImage);
      discardPile.appendChild(discardCount);
      
      // Position the discard pile
      discardPile.style.position = 'absolute';
      discardPile.style.left = '160px'; // Position to the right of draw pile
      
      // Add it to the table center
      tableCenter.appendChild(discardPile);
      
      // Store reference
      this.uiElements.discardPile = discardPile;
    }
  }
  
  hideOriginalCardStack() {
    if (this.uiElements.cardStack) {
      this.uiElements.cardStack.style.visibility = 'hidden';
      this.uiElements.cardStack.style.pointerEvents = 'none';
    }
  }
  
  updateTablePlayers(players, currentUsername) {
    if (!this.uiElements.pokerTable) {
      console.warn('Poker table not initialized');
      return;
    }
    
    // Remove existing player seats
    const existingSeats = this.uiElements.pokerTable.querySelectorAll('.player-seat');
    existingSeats.forEach(seat => seat.remove());
    
    // Add new player seats
    players.forEach((player, index) => {
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
      
      // Calculate how many mini-cards to show (max 5)
      const cardsToShow = Math.min(player.cardCount || 0, 5);
      
      // Create mini cards with count
      for (let i = 0; i < cardsToShow; i++) {
        const miniCard = document.createElement('div');
        miniCard.className = 'card-mini';
        cardCount.appendChild(miniCard);
      }
      
      // Add card count if player has cards
      if (player.cardCount > 0) {
        const count = document.createElement('span');
        count.className = 'cards-count';
        count.textContent = player.cardCount;
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
  }
  
  highlightCurrentPlayer(playerId) {
    // Remove active-player class from all seats
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => seat.classList.remove('active-player'));
    
    // Find the player by ID
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.warn(`Player with ID ${playerId} not found`);
      return;
    }
    
    // Add active-player class to the current player's seat
    const seat = document.getElementById(`player-seat-${player.username}`);
    if (seat) {
      seat.classList.add('active-player');
    }
  }
  
  // ====================== CARD HANDLING ======================
  updateCardDisplay(picture, idCard) {
    if (!this.uiElements.cardElement) {
      console.warn("Card element not found when trying to update card display");
      return;
    }
    
    // Clear existing content
    this.uiElements.cardElement.innerHTML = '';
    
    // Create an image element to display the card
    const cardImage = document.createElement('img');
    cardImage.src = picture;
    cardImage.alt = `Card ${idCard}`;
    cardImage.className = 'card-image';
    
    // Add error handling for image loading
    cardImage.onerror = function() {
      console.error(`Failed to load card image for card ${idCard}`);
      this.src = ''; // Clear the broken image
      this.alt = 'Card image failed to load';
    };
    
    // Append the image to the card element
    this.uiElements.cardElement.appendChild(cardImage);
    
    // Add the pile count if it doesn't exist
    if (!this.uiElements.cardElement.querySelector('.pile-count')) {
      this.addCardNotification();
    }
  }
  
  updateDrawPileCard(imageUrl) {
    if (!this.uiElements.drawPile) {
      console.warn("Draw pile not found when trying to update draw pile card");
      
      // Try to find it again
      this.uiElements.drawPile = document.getElementById('drawPile');
      if (!this.uiElements.drawPile) {
        console.error("Draw pile still not found - cannot update draw pile card");
        return;
      }
    }
    
    let cardImage = document.getElementById('drawPileImage');
    
    // If card image element doesn't exist, try to create it
    if (!cardImage) {
      console.warn("Draw pile image element not found, creating it");
      cardImage = document.createElement('img');
      cardImage.id = 'drawPileImage';
      cardImage.className = 'card-image';
      cardImage.style.width = '100%';
      cardImage.style.height = '100%';
      this.uiElements.drawPile.appendChild(cardImage);
    }
    
    // Set the image source
    cardImage.src = imageUrl;
    cardImage.onerror = function() {
      console.error('Failed to load draw pile card image');
      this.alt = 'Card back failed to load';
    };
  }
  
  updateDiscardPile(card) {
    if (!this.uiElements.discardPile) {
      console.warn("Discard pile not found");
      return;
    }
    
    let cardImage = document.getElementById('discardPileImage');
    if (!cardImage) {
      console.warn("Discard pile image element not found");
      return;
    }
    
    // Update the image
    cardImage.src = card.picture;
    cardImage.style.opacity = '1'; // Make fully visible when cards are present
    
    // Update the count
    const discardCount = document.getElementById('discardCount');
    if (discardCount) {
      // Increment the count
      const currentCount = parseInt(discardCount.textContent) || 0;
      discardCount.textContent = (currentCount + 1).toString();
      
      // Add double-digit class if needed
      if (currentCount + 1 > 9) {
        discardCount.classList.add('double-digit');
      }
    }
  }
  
  updatePileCount(count) {
    // Update count on draw pile
    let pileCount = document.getElementById('pileCount');
    if (!pileCount && this.uiElements.drawPile) {
      // Try to create the pile count element if it doesn't exist
      pileCount = document.createElement('div');
      pileCount.className = 'pile-count';
      pileCount.id = 'pileCount';
      if (this.uiElements.drawPile) {
        this.uiElements.drawPile.appendChild(pileCount);
      }
    }
    
    if (pileCount) {
      pileCount.textContent = count || "0";
      
      // Add a class for double-digit numbers
      if (count > 9) {
        pileCount.classList.add('double-digit');
      } else {
        pileCount.classList.remove('double-digit');
      }
    }
    
    // Update count on original card stack
    let cardPileCount = document.getElementById('cardPileCount');
    if (!cardPileCount && this.uiElements.cardElement) {
      // Try to create the card pile count element if it doesn't exist
      cardPileCount = document.createElement('div');
      cardPileCount.className = 'pile-count';
      cardPileCount.id = 'cardPileCount';
      if (this.uiElements.cardElement) {
        this.uiElements.cardElement.appendChild(cardPileCount);
      }
    }
    
    if (cardPileCount) {
      cardPileCount.textContent = count || "0";
      
      if (count > 9) {
        cardPileCount.classList.add('double-digit');
      } else {
        cardPileCount.classList.remove('double-digit');
      }
    }
  }
  
  addCardNotification() {
    if (!this.uiElements.cardElement) {
      console.warn("Cannot add card notification - card element not found");
      return;
    }
    
    // Remove any existing card count
    const existingCount = this.uiElements.cardElement.querySelector('.pile-count');
    if (existingCount) {
      existingCount.remove();
    }

    // Create a new count element
    const pileCount = document.createElement('div');
    pileCount.className = 'pile-count';
    pileCount.id = 'cardPileCount';
    pileCount.textContent = '0'; // Start with 0
    pileCount.style.position = 'absolute';
    pileCount.style.top = '-10px';
    pileCount.style.right = '-10px';
    pileCount.style.zIndex = '9999';
    
    // Add it to the card
    this.uiElements.cardElement.appendChild(pileCount);
    
    // Make sure the card and card stack have proper overflow and positioning
    this.uiElements.cardElement.style.overflow = 'visible';
    this.uiElements.cardElement.style.position = 'relative';
    
    if (this.uiElements.cardStack) {
      this.uiElements.cardStack.style.overflow = 'visible';
      this.uiElements.cardStack.style.position = 'relative';
    }
  }
  
  // ====================== TURN MANAGEMENT ======================
  startNextTurn() {
    if (!this.gameState.currentTurn) {
      // If no current turn, start with the first player
      const firstPlayer = this.players[0];
      if (firstPlayer) {
        this.setCurrentTurn(firstPlayer.id);
      }
      return;
    }
    
    // Find the current player's index
    const currentPlayerIndex = this.players.findIndex(p => p.id === this.gameState.currentTurn);
    if (currentPlayerIndex === -1) {
      console.error('Current player not found in players array');
      return;
    }
    
    // Calculate the next player index based on turn direction
    let nextPlayerIndex = (currentPlayerIndex + this.gameState.turnDirection) % this.players.length;
    // Handle negative index if going counter-clockwise
    if (nextPlayerIndex < 0) nextPlayerIndex = this.players.length - 1;
    
    // Set the next player's turn
    const nextPlayer = this.players[nextPlayerIndex];
    this.setCurrentTurn(nextPlayer.id);
  }
  
  setCurrentTurn(playerId) {
    // Update local game state
    this.gameState.currentTurn = playerId;
    
    // Highlight the current player
    this.highlightCurrentPlayer(playerId);
    
    // Send turn change to server
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        auth_token: localStorage.auth_token,
        type: 'turn_change',
        playerId: playerId,
        gameId: this.currentGameId
      }));
    }
    
    // Update UI for current player
    const isMyTurn = playerId === this.currentPlayerId;
    this.setMyTurnState(isMyTurn);
  }
  
  setMyTurnState(isMyTurn) {
    // Enable/disable appropriate actions based on whose turn it is
    if (isMyTurn) {
      console.log('It is now my turn');
      document.body.classList.add('my-turn');
      
      // Enable interactive elements
      if (this.uiElements.drawPile) {
        this.uiElements.drawPile.classList.add('active');
      }
      
      // Enable hand cards for playing
      const handCards = document.querySelectorAll('.hand-card');
      handCards.forEach(card => {
        card.classList.add('playable');
      });
    } else {
      console.log('It is not my turn');
      document.body.classList.remove('my-turn');
      
      // Disable interactive elements
      if (this.uiElements.drawPile) {
        this.uiElements.drawPile.classList.remove('active');
      }
      
      // Disable hand cards
      const handCards = document.querySelectorAll('.hand-card');
      handCards.forEach(card => {
        card.classList.remove('playable');
      });
    }
  }
  
  // ====================== PLAYER ACTIONS ======================
  handleDrawPileClick() {
    // Check if it's the player's turn (if turn-based game is enabled)
    if (this.gameState.currentTurn && this.gameState.currentTurn !== this.currentPlayerId) {
      this.showNotification("It's not your turn to draw");
      return;
    }
    
    // Request to draw a card
    this.drawCard();
  }
  
  drawCard() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot draw card - WebSocket not connected');
      return;
    }
    
    console.log('Requesting to draw a card');
    this.websocket.send(JSON.stringify({
      auth_token: localStorage.auth_token,
      type: 'add_card_to_hand',
      gameId: this.currentGameId
    }));
  }
  
  handleCardClick(card) {
    // Check if it's the player's turn (if turn-based game is enabled)
    if (this.gameState.currentTurn && this.gameState.currentTurn !== this.currentPlayerId) {
      this.showNotification("It's not your turn to play");
      return;
    }
    
    // Implement card playing logic
    this.playCard(card);
  }
  
  playCard(card) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot play card - WebSocket not connected');
      return;
    }
    
    console.log('Playing card:', card);
    this.websocket.send(JSON.stringify({
      auth_token: localStorage.auth_token,
      type: 'play_card',
      cardId: card.idCard,
      cardType: card.cardType,
      gameId: this.currentGameId
    }));
  }
  
  addCardToPlayArea(card) {
    // If we have a discard pile, update it
    if (this.uiElements.discardPile) {
      this.updateDiscardPile(card);
    } else {
      // Otherwise, create a simple visualization in the center of the table
      this.createPlayedCardEffect(card);
    }
  }
  
  removeCardFromHand(cardId) {
    // Find the card element
    const cardElement = document.querySelector(`.hand-card[data-card-id="${cardId}"]`);
    if (cardElement) {
      // Animate the removal
      cardElement.classList.add('removing');
      
      // Remove after animation
      setTimeout(() => {
        cardElement.remove();
        
        // Re-request hand to get updated layout
        this.requestHand();
      }, 500);
    } else {
      // Just request updated hand
      this.requestHand();
    }
  }
  
  createPlayedCardEffect(card) {
    // Create a temporary div for the played card animation
    const playedCard = document.createElement('div');
    playedCard.className = 'played-card';
    playedCard.style.position = 'absolute';
    playedCard.style.zIndex = '100';
    
    // Create an image for the card
    const cardImage = document.createElement('img');
    cardImage.src = card.picture;
    cardImage.alt = 'Played Card';
    cardImage.className = 'card-image';
    
    // Add to the played card div
    playedCard.appendChild(cardImage);
    
    // Add to the poker table
    const tableCenter = this.uiElements.pokerTable.querySelector('.table-center');
    if (tableCenter) {
      tableCenter.appendChild(playedCard);
      
      // Animate the card
      setTimeout(() => {
        playedCard.classList.add('played');
        
        // Remove after animation
        setTimeout(() => {
          playedCard.remove();
        }, 1000);
      }, 100);
    }
  }
  
  // ====================== GAME STATE MANAGEMENT ======================
  updateGamePhaseUI(phase) {
    // Remove any existing phase classes
    document.body.classList.remove('phase-waiting', 'phase-setup', 'phase-playing', 'phase-finished');
    
    // Add the current phase class
    document.body.classList.add(`phase-${phase}`);
    
    // Update any phase-specific UI elements
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
        this.showGameResults();
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
  
  showGameResults() {
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
      
      const playerScore = document.createElement('div');
      playerScore.className = 'player-score';
      playerScore.textContent = player.score || 'N/A';
      
      // Highlight winner
      if (player.winner) {
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
    returnButton.addEventListener('click', () => {
      localStorage.setItem('intentionalNavigation', 'true');
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
  
  // ====================== CHAT FUNCTIONALITY ======================
  initChatToggle() {
    // Create chat toggle button if it doesn't exist
    if (!document.getElementById('chatToggle')) {
      const chatToggle = document.createElement('div');
      chatToggle.className = 'chat-toggle';
      chatToggle.id = 'chatToggle';
      document.body.appendChild(chatToggle);
      
      // Store reference
      this.uiElements.chatToggle = chatToggle;
      
      // Initialize chat state from localStorage (default to visible)
      const chatHidden = localStorage.getItem('chatHidden') === 'true';
      if (chatHidden && this.uiElements.chatContainer) {
        this.uiElements.chatContainer.classList.add('chat-hidden');
        chatToggle.classList.add('chat-hidden');
      }
      
      // Toggle chat visibility when button is clicked
      chatToggle.addEventListener('click', () => this.toggleChat());
    }
    
    // Update chat header with game information
    this.updateChatHeader();
  }
  
  toggleChat() {
    if (!this.uiElements.chatContainer || !this.uiElements.chatToggle) return;
    
    // Toggle classes
    this.uiElements.chatContainer.classList.toggle('chat-hidden');
    this.uiElements.chatToggle.classList.toggle('chat-hidden');
    
    // Save state to localStorage
    const isHidden = this.uiElements.chatContainer.classList.contains('chat-hidden');
    localStorage.setItem('chatHidden', isHidden.toString());
  }
  
  initChatInput() {
    if (!this.uiElements.messageInput) return;
    
    // Ensure the input has high z-index and is focusable
    this.uiElements.messageInput.style.zIndex = "1100";
    this.uiElements.messageInput.style.position = "relative";
    this.uiElements.messageInput.style.pointerEvents = "auto";
    
    // Add event listeners with stopPropagation to prevent events from being blocked
    this.uiElements.messageInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    
    this.uiElements.messageInput.addEventListener('focus', function(e) {
      e.stopPropagation();
    });
    
    this.uiElements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });
    
    // Also fix the button
    const sendButton = document.querySelector('.input-area button');
    if (sendButton) {
      sendButton.style.zIndex = "1100";
      sendButton.style.position = "relative";
      sendButton.style.pointerEvents = "auto";
      
      sendButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sendChatMessage();
      });
    }
    
    // Fix the input area container
    const inputArea = document.querySelector('.input-area');
    if (inputArea) {
      inputArea.style.zIndex = "1090";
      inputArea.style.position = "relative";
      inputArea.style.pointerEvents = "auto";
    }
    
    // Make sure the container and chatbox don't block events
    const chatbox = document.querySelector('.chatbox');
    if (this.uiElements.chatContainer) this.uiElements.chatContainer.style.pointerEvents = "auto";
    if (chatbox) chatbox.style.pointerEvents = "auto";
  }
  
  updateChatHeader() {
    const chatHeader = document.querySelector('.container h1');
    if (chatHeader && this.currentGameId) {
      chatHeader.textContent = `Game #${this.currentGameId} Chat`;
    }
  }
  
  sendChatMessage() {
    if (!this.uiElements.messageInput || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
    
    const message = this.uiElements.messageInput.value.trim();
    if (!message) return;
    
    const data = { 
      auth_token: localStorage.auth_token, 
      message: message, 
      gameId: this.currentGameId
    };
    this.websocket.send(JSON.stringify(data));
    this.uiElements.messageInput.value = '';
  }
  
  // ====================== NOTIFICATION SYSTEM ======================
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
  
  showCardPlayedNotification(username, card) {
    const message = `${username} played a card`;
    this.showNotification(message, 'card-played');
  }
  
  // ====================== PROFILE UI ======================
  updateProfilesSidebar(users) {
    const profileContainer = document.getElementById('profiles');
    if (!profileContainer) return;
    
    profileContainer.innerHTML = ''; // Clear existing profiles

    users.forEach((user) => {
      const profileBox = document.createElement('div');
      profileBox.className = 'profile-box';

      const profilePicture = document.createElement('img');
      
      // Check if pp_path is base64 or a regular path
      if (user.pp_path && user.pp_path.startsWith('data:image')) {
        profilePicture.src = user.pp_path;
      } else if (user.pp_path) {
        profilePicture.src = user.pp_path;
      } else {
        profilePicture.src = 'profile_pictures/default.jpg';
      }
      
      profilePicture.alt = 'Profile Picture';
      profilePicture.className = 'profile-picture';

      const profileName = document.createElement('div');
      profileName.className = 'profile-name';
      profileName.textContent = user.username;
      
      // Add card count if available
      if (user.cardCount !== undefined) {
        const cardCountBadge = document.createElement('div');
        cardCountBadge.className = 'card-count-badge';
        cardCountBadge.textContent = user.cardCount;
        profileBox.appendChild(cardCountBadge);
      }

      profileBox.appendChild(profilePicture);
      profileBox.appendChild(profileName);
      profileContainer.appendChild(profileBox);
    });
  }
  
  // ====================== EVENT LISTENERS ======================
  setupEventListeners() {
    // Card click event for drawing cards
    if (this.uiElements.cardElement) {
      this.uiElements.cardElement.addEventListener('click', () => this.drawCard());
    }
    
    // Add button for finishing the game
    this.createGameControlButtons();
    
    // Make sure the page doesn't reload on form submissions
    document.querySelectorAll('form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
      });
    });
  }
  
  createGameControlButtons() {
    // Create container for game control buttons if it doesn't exist
    let controlsContainer = document.getElementById('gameControlsContainer');
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.id = 'gameControlsContainer';
      controlsContainer.className = 'game-controls-container';
      document.body.appendChild(controlsContainer);
    }
    
    // Add finish game button
    const finishButton = document.createElement('button');
    finishButton.id = 'finishGameBtn';
    finishButton.className = 'game-control-btn finish-game';
    finishButton.textContent = 'Finish Game';
    finishButton.addEventListener('click', () => this.finishGame());
    
    // Add return to lobby button
    const lobbyButton = document.createElement('button');
    lobbyButton.id = 'backToLobbyBtn';
    lobbyButton.className = 'game-control-btn back-to-lobby';
    lobbyButton.textContent = 'Back to Lobby';
    lobbyButton.addEventListener('click', () => this.returnToLobby());
    
    // Add buttons to container
    controlsContainer.appendChild(finishButton);
    controlsContainer.appendChild(lobbyButton);
  }
  
  // ====================== GAME ACTIONS ======================
  finishGame() {
    if (!confirm('Are you sure you want to finish this game? This cannot be undone.')) {
      return;
    }
    
    fetch('http://localhost:3000/finish-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ gameId: this.currentGameId }),
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to finish game');
      }
      return response.json();
    })
    .then(data => {
      console.log('Successfully finished game:', data);
      this.showNotification('Game finished successfully!');
      
      // Update game state
      this.gameState.phase = 'finished';
      this.updateGamePhaseUI('finished');
    })
    .catch(error => {
      console.error('Error finishing game:', error);
      this.showErrorNotification('Failed to finish game: ' + error.message);
    });
  }
  
  returnToLobby() {
    // Set a navigation flag that will be checked by other scripts
    localStorage.setItem('intentionalNavigation', 'true');
    localStorage.setItem('wsWasOpen', 'true');
    
    // Small delay to ensure localStorage is updated before navigation
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
  
  // ====================== WEBSOCKET REQUEST FUNCTIONS ======================
  requestUsersProfile() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request users profile - WebSocket not connected');
      return;
    }
    
    const data = {
      auth_token: localStorage.auth_token, 
      type: 'connected_users', 
      gameId: this.currentGameId
    };
    this.websocket.send(JSON.stringify(data));
  }
  
  requestGameState() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request game state - WebSocket not connected');
      return;
    }
    
    const data = {
      auth_token: localStorage.auth_token, 
      type: 'game_state_request', 
      gameId: this.currentGameId
    };
    this.websocket.send(JSON.stringify(data));
  }

  requestCard() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request card - WebSocket not connected');
      return;
    }
    
    const data = {
      auth_token: localStorage.auth_token, 
      type: 'card_request', 
      gameId: this.currentGameId
    };
    this.websocket.send(JSON.stringify(data));
  }

  requestHand() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request hand - WebSocket not connected');
      return;
    }
    
    const data = {
      auth_token: localStorage.auth_token, 
      type: 'hand_request', 
      gameId: this.currentGameId
    };
    this.websocket.send(JSON.stringify(data));
  }
}

// ====================== GAME INITIALIZATION ======================
// Create global instance of the card game framework
globalThis.cardGame = new CardGameFramework();

// Expose functions for HTML onclick handlers
globalThis.sendJson = function() {
  if (globalThis.cardGame) {
    globalThis.cardGame.sendChatMessage();
  }
};

globalThis.finishCurrentGame = function() {
  if (globalThis.cardGame) {
    globalThis.cardGame.finishGame();
  }
};

globalThis.returnToLobby = function() {
  if (globalThis.cardGame) {
    globalThis.cardGame.returnToLobby();
  }
};