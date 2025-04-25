// Simple script to fix the card notification badge
document.addEventListener('DOMContentLoaded', function() {
    // Fix for card notification badge
    setTimeout(function() {
      // Get the card element
      const cardElement = document.getElementById('card');
      if (!cardElement) return;
      
      // Make sure the card has correct position and overflow
      cardElement.style.position = 'relative';
      cardElement.style.overflow = 'visible';
      
      // Make the card stack have correct overflow
      const cardStack = document.getElementById('cardStack');
      if (cardStack) {
        cardStack.style.position = 'relative';
        cardStack.style.overflow = 'visible';
      }
      
      // Check if card already has a badge
      if (!cardElement.querySelector('.pile-count')) {
        // Create the badge
        const badge = document.createElement('div');
        badge.className = 'pile-count';
        badge.id = 'cardPileCount';
        badge.textContent = '42'; // Test with a number to check visibility
        
        // Add to the card
        cardElement.appendChild(badge);
        console.log('Added notification badge to card');
      }
      
      // Also check for badges on draw pile if it exists
      const drawPile = document.getElementById('drawPile');
      if (drawPile) {
        drawPile.style.overflow = 'visible';
        
        // Find or create badge on draw pile
        let pileCount = drawPile.querySelector('.pile-count');
        if (!pileCount) {
          pileCount = document.createElement('div');
          pileCount.className = 'pile-count';
          pileCount.id = 'pileCount';
          pileCount.textContent = '42';
          drawPile.appendChild(pileCount);
        }
      }
    }, 500); // Slight delay to ensure other elements are loaded
  });