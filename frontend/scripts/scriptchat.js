const chat = document.getElementById('messageInput');
const ws = new WebSocket('ws://localhost:3000');

function sendJson() {
  event.preventDefault(); // Prevent default form submission
  const message = chat.value;
  const data = { auth_token: localStorage.auth_token, message: message };
  ws.send(JSON.stringify(data));
  chat.value = '';
}

function goToLogin() {
  location.href = '../login.html';
}

function requestUsersProfile() {
  const data = { auth_token: localStorage.auth_token, type: 'connected_users' };
  ws.send(JSON.stringify(data));
}

function requestCard() {
  const data = { auth_token: localStorage.auth_token, type: 'card_request' };
  ws.send(JSON.stringify(data));
}

function requestHand() {
  const data = { auth_token: localStorage.auth_token, type: 'hand_request' };
  ws.send(JSON.stringify(data));
}

const cardElement = document.getElementById('card');
cardElement.addEventListener('click', () => {
  const data = { auth_token: localStorage.auth_token, type: 'add_card_to_hand' };
  ws.send(JSON.stringify(data));
});

chat.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    sendJson();
  }
});

/****************************************************************/
/************************* WEBSOCKET ****************************/
/****************************************************************/

ws.onopen = function() {
  console.log('WebSocket connection established.');
  requestUsersProfile(); // Request to get user profile when the connection is established
  console.log('Requested users profiles');
  requestCard(); // Request to get card when the connection is established
  console.log('Requested card');
  requestHand();
  console.log('Requested hand');
};

ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('WebSocket message received:', data.type);
  if (data.type == 'message') {
    console.log('Received message:', data);
    const message = JSON.parse(event.data);
    const messageBox = document.createElement('div');
    messageBox.className = 'message-box';

    const userPicture = document.createElement('img');
    userPicture.src = message.user_pp_path;
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

    // Vérifie si c'est un message de l'utilisateur actuel
    const currentUser = data.username; // Assure-toi que l'username est stocké lors du login
    console.log('Current user:', currentUser);
    if (message.owner === currentUser) {
      messageBox.classList.add('my-message');
    } else {
      messageBox.classList.add('other-message');
    }

    document.getElementById('messages').appendChild(messageBox);
  }
  if (data.type == 'connected_users') {
    const users = data.users;
    const profileContainer = document.getElementById('profiles');
    profileContainer.innerHTML = ''; // Clear existing profiles

    users.forEach(user => {
      console.log(user);
      const profileBox = document.createElement('div');
      profileBox.className = 'profile-box';

      const profilePicture = document.createElement('img');
      profilePicture.src = user.pp_path;
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
  
  if (data.type == 'card_change') {
    const cardElement = document.getElementById('card');
    console.log('Received card data:', data);
    
    // Use the card's picture from the database (base64 encoded)
    if (cardElement) {
      // Clear existing content
      cardElement.innerHTML = '';
      
      // Create an image element to display the card
      const cardImage = document.createElement('img');
      cardImage.src = data.card.picture; // This already contains the data:image/png;base64 prefix
      cardImage.alt = `Card ${data.card.idCard}`;
      cardImage.className = 'card-image';
      
      // Append the image to the card element
      cardElement.appendChild(cardImage);
    }
  }

  if (data.type === 'player_hand') {
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
  }
};

ws.onerror = function(error) {
  console.error('WebSocket error:', error);
  goToLogin();
};

ws.onclose = function(event) {
  console.log('WebSocket connection closed:', event);
  goToLogin();
};