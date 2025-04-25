// Create a self-executing function to avoid polluting the global namespace
(function() {
  // Store references to important DOM elements
  let pokerTable = null;
  let drawPile = null;
  let originalCardStack = null;
  let cardElement = null;
  
  // Initialize the poker table
  globalThis.initPokerTable = function() {
    console.log('Initializing poker table');
    
    // Store reference to the original card stack
    originalCardStack = document.getElementById('cardStack');
    cardElement = document.getElementById('card');
    
    if (!originalCardStack || !cardElement) {
      console.warn('Original card stack or card element not found');
      return;
    }
    
    // Create the poker table if it doesn't exist
    if (!document.getElementById('pokerTableContainer')) {
      createPokerTable();
    }
    
    // Hide the original card stack
    hideOriginalCardStack();
  };
  
  // Function to create the poker table
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
  
  // Function to update the player positions around the table
  globalThis.updateTablePlayers = function(players, currentUsername) {
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
  };
  
  // Update the draw pile card image
  globalThis.updateDrawPileCard = function(imageUrl) {
    if (!drawPile) return;
    
    const cardImage = document.getElementById('drawPileImage');
    if (cardImage) {
      cardImage.src = imageUrl;
    }
    
    // Also update the original card if it exists
    if (cardElement) {
      const originalCardImage = cardElement.querySelector('.card-image');
      if (originalCardImage) {
        originalCardImage.src = imageUrl;
      }
    }
  };
  
  // Update the pile count with fixed position and styling
  globalThis.updatePileCount = function(count) {
    const pileCount = document.getElementById('pileCount');
    if (pileCount) {
      pileCount.textContent = count || "0";
      
      // Ensure the count indicator has sufficient size for double-digit numbers
      if (count > 9) {
        pileCount.style.fontSize = "12px";
      } else {
        pileCount.style.fontSize = "14px";
      }
    }
    
    // Also update original card stack count if it exists
    const originalPileCount = document.querySelector('.card-stack .pile-count');
    if (originalPileCount) {
      originalPileCount.textContent = count || "0";
      
      if (count > 9) {
        originalPileCount.style.fontSize = "12px";
      } else {
        originalPileCount.style.fontSize = "14px";
      }
    }
  };
  
  // Function to add card count to the original card
  function addCardCountToOriginal() {
    if (originalCardStack && cardElement) {
      // Check if it already has a count indicator
      if (!cardElement.querySelector('.pile-count')) {
        const pileCount = document.createElement('div');
        pileCount.className = 'pile-count';
        pileCount.textContent = "0";
        cardElement.appendChild(pileCount);
      }
    }
  }
  
  // Initialize when the DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    // Wait a short time to ensure other elements are loaded
    setTimeout(() => {
      globalThis.initPokerTable();
      addCardCountToOriginal(); // Add count to original card too
    }, 500);
  });
})();