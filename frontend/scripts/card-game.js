// ====================== MAIN APPLICATION LOGIC ======================
// Immediately-invoked function expression for encapsulation
(function() {
  // Global variables
  let websocket = null;
  let pokerTable = null;
  let drawPile = null;
  let originalCardStack = null;
  let cardElement = null;
  let chatContainer = null;
  let chatToggle = null;
  let messageInput = null;
  let currentGameId = null; // Store the current game ID
  let componentsInitialized = false; // New flag to track initialization status

  // Initialize application when DOM is loaded
  document.addEventListener('DOMContentLoaded', init);
  globalThis.addEventListener('beforeunload', handlePageUnload);

  // Main initialization function with proper sequential flow
  async function init() {
    try {
      // First, check if user has an active game
      try {
        const response = await fetch('http://localhost:3000/active-game', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        
        // If no active game, redirect to games page
        if (!response.ok) {
          console.log('No active game found, redirecting to games page');
          globalThis.location.href = 'games.html';
          return;
        }
        
        // Store game data if needed
        const gameData = await response.json();
        if (gameData && gameData.game && gameData.game.idGame) {
          console.log('Active game found:', gameData.game.idGame);
          // Store in localStorage for navigation
          localStorage.setItem('currentGameId', gameData.game.idGame);
          currentGameId = gameData.game.idGame;
        }
      } catch (error) {
        console.error('Error checking for active game:', error);
        globalThis.location.href = 'games.html';
        return;
      }
      
      console.log(`Initializing game UI for game ID: ${currentGameId}`);
      
      // Continue with normal initialization if we have an active game
      // Store references to DOM elements
      cardElement = document.getElementById('card');
      originalCardStack = document.getElementById('cardStack');
      chatContainer = document.querySelector('.container');
      messageInput = document.getElementById('messageInput');
      
      console.log('DOM elements initialization:');
      console.log('- Card element:', cardElement ? 'found' : 'not found');
      console.log('- Original card stack:', originalCardStack ? 'found' : 'not found');
      console.log('- Chat container:', chatContainer ? 'found' : 'not found');
      console.log('- Message input:', messageInput ? 'found' : 'not found');
      
      // IMPORTANT: Wait for components to initialize before connecting WebSocket
      // Use a Promise to ensure sequential execution
      await new Promise((resolve) => {
        setTimeout(() => {
          try {
            console.log('Starting components initialization');
            initChatToggle();
            initChatInput();
            initPokerTable();
            addCardNotification();
            setupEventListeners();
            componentsInitialized = true;
            console.log('Components initialization completed');
            resolve();
          } catch (error) {
            console.error('Error during component initialization:', error);
            resolve(); // Still resolve to continue with WebSocket connection
          }
        }, 1500); // Increased timeout for safer initialization
      });
      
      // Initialize WebSocket connection ONLY after all components are ready
      console.log('UI components initialized, now connecting WebSocket...');
      connectWebSocket();
    } catch (error) {
      console.error('Error during main initialization:', error);
      // Redirect to games page on critical error
      globalThis.location.href = 'games.html';
    }

    // Check if we're returning from hello page
    if (localStorage.getItem('wsWasOpen') === 'true') {
      // Clear the flag
      localStorage.removeItem('wsWasOpen');
    }
  }

  // Updated WebSocket handling with additional safety checks
  function connectWebSocket() {
    websocket = new WebSocket('ws://localhost:3000');
    
    websocket.onopen = handleWebSocketOpen;
    websocket.onmessage = handleWebSocketMessage;
    websocket.onerror = handleWebSocketError;
    websocket.onclose = handleWebSocketClose;
  }
// Replace the handlePageUnload function in card-game.js
function handlePageUnload(event) {
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
  
  // ====================== WEBSOCKET FUNCTIONALITY ======================
  // Handle WebSocket open event with safety checks
  function handleWebSocketOpen() {
    console.log('WebSocket connection established.');
    
    // Only request data if UI components are ready
    if (componentsInitialized && pokerTable) {
      console.log('UI components are ready, requesting initial data');
      requestUsersProfile();
      requestCard();
      requestHand();
    } else {
      // If components aren't ready yet, wait and then request data
      console.log('UI components not fully initialized, waiting before requesting data...');
      const checkInterval = setInterval(() => {
        if (componentsInitialized && pokerTable && drawPile) {
          clearInterval(checkInterval);
          console.log('UI components now initialized, requesting data...');
          requestUsersProfile();
          console.log('Requested users profiles');
          requestCard();
          console.log('Requested card');
          requestHand();
          console.log('Requested hand');
        }
      }, 200);
      
      // Safety timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!componentsInitialized || !pokerTable) {
          console.warn('Timeout waiting for UI components - requesting data anyway');
          requestUsersProfile();
          requestCard();
          requestHand();
        }
      }, 5000);
    }
  }
  
  // Handle WebSocket messages
  function handleWebSocketMessage(event) {
    const data = JSON.parse(event.data);
    console.log('WebSocket message received:', data.type, data);
    
  // If the message includes a gameId, verify it matches our current game
  if (data.gameId && data.gameId != currentGameId) {
    console.log(`Ignoring message for different game: ${data.gameId}, our game: ${currentGameId}`);
    return;
  }
    
    // Handle different message types
    switch(data.type) {
      case 'message':
        handleChatMessage(data);
        break;
      case 'connected_users':
        handleConnectedUsers(data);
        break;
      case 'card_change':
        handleCardChange(data);
        break;
      case 'player_hand':
        handlePlayerHand(data);
        break;
      case 'player_hand_update':
        requestUsersProfile(); // Request updated user list
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }
  
  function handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    
    // Only redirect to login if not navigating to games page
    if (localStorage.getItem('wsWasOpen') !== 'true') {
      goToLogin();
    }
  }
  
  function handleWebSocketClose(event) {
    console.log('WebSocket connection closed:', event);
    
    // Only redirect to login if we're not navigating to another page
    if (localStorage.getItem('wsWasOpen') !== 'true') {
      goToLogin();
    }
  }
  
  // Handle chat messages
  function handleChatMessage(data) {
    console.log('Received message:', data);
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
    const currentUser = data.username;
    console.log('Current user:', currentUser);
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
  
  // Handle connected users update
  function handleConnectedUsers(data) {
    console.log('Received connected users:', data.users);
    const users = data.users;
    
    // Update the user profiles sidebar
    updateProfilesSidebar(users);
    
    // Get current username
    let currentUsername = data.username;
    if (!currentUsername) {
      currentUsername = localStorage.getItem('currentUsername');
    }
    if (!currentUsername && data.owner) {
      currentUsername = data.owner;
      storeCurrentUsername(currentUsername);
    }
    
    // Update the poker table players
    updateTablePlayers(users, currentUsername);
  }
  
  // Update the profiles sidebar
  function updateProfilesSidebar(users) {
    const profileContainer = document.getElementById('profiles');
    if (!profileContainer) return;
    
    console.log('Updating profiles sidebar');
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

      profileBox.appendChild(profilePicture);
      profileBox.appendChild(profileName);
      profileContainer.appendChild(profileBox);
    });
  }
  
  // Enhanced card change handler with better error reporting
  function handleCardChange(data) {
    console.log('Received card data:', data);
    
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
    updateCardDisplay(data.card.picture, data.card.idCard);
    
    // Update the draw pile on the poker table
    updateDrawPileCard(data.card.picture);
    
    // Update pile count if available
    if (data.pileCount !== undefined) {
      updatePileCount(data.pileCount);
    }
  }
  
  // Improved card display update with proper error handling
  function updateCardDisplay(picture, idCard) {
    if (!cardElement) {
      console.warn("Card element not found when trying to update card display");
      return;
    }
    
    console.log(`Updating card display for card ${idCard} with image data length: ${picture ? picture.length : 0}`);
    
    // Clear existing content
    cardElement.innerHTML = '';
    
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
    cardElement.appendChild(cardImage);
    
    // Add the pile count if it doesn't exist
    if (!cardElement.querySelector('.pile-count')) {
      addCardNotification();
    }
  }
  
  // Handle player hand update
  function handlePlayerHand(data) {
    console.log('Received hand data:', data);
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

      handContainer.appendChild(cardElement);
    });
    
    // Update player's card count in the table view
    const currentUsername = localStorage.getItem('currentUsername');
    if (currentUsername && websocket && websocket.readyState === WebSocket.OPEN) {
      const cardCount = data.hand.length;
      
      // Send update to server to broadcast this player's card count
      websocket.send(JSON.stringify({
        auth_token: localStorage.auth_token,
        type: 'player_hand_update',
        username: currentUsername,
        cardCount: cardCount
      }));
    }
  }
  
  // ====================== CHAT FUNCTIONALITY ======================
  // Initialize chat toggle button
  function initChatToggle() {
    updateChatHeader();
    // Create chat toggle button if it doesn't exist
    if (!document.getElementById('chatToggle')) {
      chatToggle = document.createElement('div');
      chatToggle.className = 'chat-toggle';
      chatToggle.id = 'chatToggle';
      document.body.appendChild(chatToggle);
      
      // Initialize chat state from localStorage (default to visible)
      const chatHidden = localStorage.getItem('chatHidden') === 'true';
      if (chatHidden && chatContainer) {
        chatContainer.classList.add('chat-hidden');
        chatToggle.classList.add('chat-hidden');
      }
      
      // Toggle chat visibility when button is clicked
      chatToggle.addEventListener('click', toggleChat);
    }
  }
  
  // Toggle chat visibility
  function toggleChat() {
    if (!chatContainer || !chatToggle) return;
    
    // Toggle classes
    chatContainer.classList.toggle('chat-hidden');
    chatToggle.classList.toggle('chat-hidden');
    
    // Save state to localStorage
    const isHidden = chatContainer.classList.contains('chat-hidden');
    localStorage.setItem('chatHidden', isHidden.toString());
  }
  
  // Initialize chat input
  function initChatInput() {
    if (!messageInput) return;
    
    // Ensure the input has high z-index and is focusable
    messageInput.style.zIndex = "1100";
    messageInput.style.position = "relative";
    messageInput.style.pointerEvents = "auto";
    
    // Add event listeners with stopPropagation to prevent events from being blocked
    messageInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    
    messageInput.addEventListener('focus', function(e) {
      e.stopPropagation();
    });
    
    // Also fix the button
    const sendButton = document.querySelector('.input-area button');
    if (sendButton) {
      sendButton.style.zIndex = "1100";
      sendButton.style.position = "relative";
      sendButton.style.pointerEvents = "auto";
      
      sendButton.addEventListener('click', function(e) {
        e.stopPropagation();
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
    if (chatContainer) chatContainer.style.pointerEvents = "auto";
    if (chatbox) chatbox.style.pointerEvents = "auto";
  }
  
  // ====================== POKER TABLE FUNCTIONALITY ======================
  // Improved poker table initialization with robust retry logic
  function initPokerTable() {
    console.log('Initializing poker table');
    
    if (!originalCardStack || !cardElement) {
      console.warn('Original card stack or card element not found, will retry');
      setTimeout(initPokerTable, 200);
      return;
    }
    
    // Create the poker table if it doesn't exist
    if (!document.getElementById('pokerTableContainer')) {
      try {
        createPokerTable();
        console.log('Poker table created successfully');
        
        // Double-check pokerTable and drawPile references are set
        pokerTable = document.getElementById('pokerTableContainer');
        drawPile = document.getElementById('drawPile');
        
        if (!pokerTable || !drawPile) {
          console.error('Poker table or draw pile references missing after creation');
          setTimeout(initPokerTable, 200); // Retry
          return;
        }
        
        // Hide the original card stack
        hideOriginalCardStack();
      } catch (error) {
        console.error('Error creating poker table:', error);
        setTimeout(initPokerTable, 300);
      }
    } else {
      console.log('Poker table already exists');
      // Make sure references are set
      pokerTable = document.getElementById('pokerTableContainer');
      drawPile = document.getElementById('drawPile');
    }
  }
  // Create the poker table
  function createPokerTable() {
    // Create the table container
    pokerTable = document.createElement('div');
    pokerTable.id = 'pokerTableContainer';
    pokerTable.className = 'poker-table-container';
    
    // Create the table center area
    const tableCenter = document.createElement('div');
    tableCenter.className = 'table-center';
    
    // Create draw pile
    drawPile = document.createElement('div');
    drawPile.id = 'drawPile';
    drawPile.className = 'draw-pile';
    
    // Create card count indicator with fixed size and positioning
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
    drawPile.addEventListener('click', function() {
      // Trigger the same action as the original card stack
      if (cardElement) {
        cardElement.click();
      }
    });
  }
  
  // Hide the original card stack without removing it
  function hideOriginalCardStack() {
    if (originalCardStack) {
      originalCardStack.style.visibility = 'hidden';
      originalCardStack.style.pointerEvents = 'none';
    }
  }
  
  // Update the player positions around the table
  function updateTablePlayers(players, currentUsername) {
    if (!pokerTable) {
      console.warn('Poker table not initialized');
      return;
    }
    
    console.log('Updating table players:', players);
    
    // Remove existing player seats
    const existingSeats = pokerTable.querySelectorAll('.player-seat');
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
      pokerTable.appendChild(seat);
    });
  }
  
  // Improved draw pile card update with robust error handling
  function updateDrawPileCard(imageUrl) {
    if (!drawPile) {
      console.warn("Draw pile not found when trying to update draw pile card");
      
      // Try to find it again
      drawPile = document.getElementById('drawPile');
      if (!drawPile) {
        console.error("Draw pile still not found - cannot update draw pile card");
        return;
      }
    }
    
    console.log(`Updating draw pile card with image URL length: ${imageUrl ? imageUrl.length : 0}`);
    
    let cardImage = document.getElementById('drawPileImage');
    
    // If card image element doesn't exist, try to create it
    if (!cardImage) {
      console.warn("Draw pile image element not found, creating it");
      cardImage = document.createElement('img');
      cardImage.id = 'drawPileImage';
      cardImage.className = 'card-image';
      cardImage.style.width = '100%';
      cardImage.style.height = '100%';
      drawPile.appendChild(cardImage);
    }
    
    // Set the image source
    cardImage.src = imageUrl;
    cardImage.onerror = function() {
      console.error('Failed to load draw pile card image');
      this.alt = 'Card back failed to load';
    };
  }
  
  // Enhanced pile count update with proper error handling
  function updatePileCount(count) {
    console.log(`Updating pile count to: ${count}`);
    
    // Update count on draw pile
    let pileCount = document.getElementById('pileCount');
    if (!pileCount && drawPile) {
      // Try to create the pile count element if it doesn't exist
      console.warn("Pile count element not found on draw pile, creating it");
      pileCount = document.createElement('div');
      pileCount.className = 'pile-count';
      pileCount.id = 'pileCount';
      if (drawPile) {
        drawPile.appendChild(pileCount);
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
    if (!cardPileCount && cardElement) {
      // Try to create the card pile count element if it doesn't exist
      console.warn("Pile count element not found on original card, creating it");
      cardPileCount = document.createElement('div');
      cardPileCount.className = 'pile-count';
      cardPileCount.id = 'cardPileCount';
      if (cardElement) {
        cardElement.appendChild(cardPileCount);
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
  
  // ====================== CARD NOTIFICATION FUNCTIONALITY ======================
 // Enhanced card notification handling
 function addCardNotification() {
  if (!cardElement) {
    console.warn("Cannot add card notification - card element not found");
    return;
  }
  
  // Remove any existing card count
  const existingCount = cardElement.querySelector('.pile-count');
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
  cardElement.appendChild(pileCount);
  
  // Make sure the card and card stack have proper overflow and positioning
  cardElement.style.overflow = 'visible';
  cardElement.style.position = 'relative';
  
  if (originalCardStack) {
    originalCardStack.style.overflow = 'visible';
    originalCardStack.style.position = 'relative';
  }
  
  console.log('Added notification badge to card');
}
  
  // ====================== UTILITY FUNCTIONS ======================
  // Store current username
  function storeCurrentUsername(username) {
    localStorage.setItem('currentUsername', username);
  }
  
  // Redirect to login page
  function goToLogin() {
    location.href = 'login.html';
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Card click event for drawing cards
    if (cardElement) {
      cardElement.addEventListener('click', () => {
        sendCardRequest('add_card_to_hand');
      });
    }
    
    // Enter key event for chat input
    if (messageInput) {
      messageInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          sendJson();
        }
      });
    }
  }
  
  function finishCurrentGame() {
    // First get the current active game from the server
    fetch('http://localhost:3000/active-game', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No active game found');
        }
        throw new Error('Failed to get active game');
      }
      return response.json();
    })
    .then(data => {
      if (!data.game || !data.game.idGame) {
        console.log('No current game to finish');
        alert('You don\'t have an active game to finish.');
        return;
      }
      
      const gameId = data.game.idGame;
      
      if (!confirm('Are you sure you want to finish this game? This cannot be undone.')) {
        return;
      }
      
      // Now finish the game with the retrieved game ID
      return fetch('http://localhost:3000/finish-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gameId: gameId }),
        credentials: 'include'
      });
    })
    .then(response => {
      if (!response || !response.ok) {
        throw new Error('Failed to finish game');
      }
      return response.json();
    })
    .then(data => {
      console.log('Successfully finished game:', data);
      alert('Game finished successfully!');
      
      // Redirect to game selection
      globalThis.location.href = 'games.html';
    })
    .catch(error => {
      console.error('Error in finish game process:', error);
      alert('Error: ' + error.message);
    });
  }

  function updateChatHeader() {
    const chatHeader = document.querySelector('.container h1');
    if (chatHeader && currentGameId) {
      chatHeader.textContent = `Game #${currentGameId} Chat`;
    }
  }

  // ====================== WEBSOCKET REQUEST FUNCTIONS ======================
  // Send chat message
  function sendJson() {
    if (!messageInput || !websocket || websocket.readyState !== WebSocket.OPEN) return;
    
    const message = messageInput.value;
    if (!message) return;
    
    const data = { auth_token: localStorage.auth_token, message: message, gameId: currentGameId};
    websocket.send(JSON.stringify(data));
    messageInput.value = '';
  }
  
  // WebSocket request functions
  function requestUsersProfile() {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request users profile - WebSocket not connected');
      return;
    }
    
    console.log('Requesting user profiles for game:', currentGameId);
    const data = {auth_token: localStorage.auth_token, type: 'connected_users', gameId: currentGameId};
    websocket.send(JSON.stringify(data));
  }

  function requestCard() {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request card - WebSocket not connected');
      return;
    }
    
    console.log('Requesting card for game:', currentGameId);
    const data = {auth_token: localStorage.auth_token, type: 'card_request', gameId: currentGameId};
    websocket.send(JSON.stringify(data));
  }

  function requestHand() {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot request hand - WebSocket not connected');
      return;
    }
    
    console.log('Requesting hand for game:', currentGameId);
    const data = {auth_token: localStorage.auth_token, type: 'hand_request', gameId: currentGameId};
    websocket.send(JSON.stringify(data));
  }

  // Send card request (for drawing cards)
  function sendCardRequest(type) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    
    const data = { auth_token: localStorage.auth_token, type: type, gameId: currentGameId};
    websocket.send(JSON.stringify(data));
  }
  
  // ====================== EXPOSE PUBLIC API ======================
  // Expose functions that need to be accessible from HTML onclick handlers
  globalThis.sendJson = sendJson;
  globalThis.goToLogin = goToLogin;
  globalThis.finishCurrentGame = finishCurrentGame;
  
  // Debugging function for card badges
  globalThis.debugCardBadges = function(count) {
    // Set the count on all badges
    const badges = document.querySelectorAll('.pile-count');
    badges.forEach(badge => {
      badge.textContent = count || '42';
      badge.style.display = 'flex'; // Make sure they're visible
    });
    
    // Log badge positions
    console.log('Badge positions:');
    badges.forEach((badge, index) => {
      const rect = badge.getBoundingClientRect();
      console.log(`Badge ${index}: top=${rect.top}, right=${rect.right}, bottom=${rect.bottom}, left=${rect.left}`);
    });
  };
})();