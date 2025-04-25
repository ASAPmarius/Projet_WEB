// Add card notification to original card
function addCardNotification() {
    // Find the original card element
    const cardElement = document.getElementById('card');
    if (!cardElement) return;
    
    // Remove any existing card count
    const existingCount = cardElement.querySelector('.pile-count');
    if (existingCount) {
      existingCount.remove();
    }
  
    // Create a new count element
    const pileCount = document.createElement('div');
    pileCount.className = 'pile-count';
    pileCount.id = 'cardPileCount';
    pileCount.textContent = '42'; // Test number to make sure it's visible
    
    // Add it to the card
    cardElement.appendChild(pileCount);
    
    // Make sure the card and card stack have proper overflow
    cardElement.style.overflow = 'visible';
    
    const cardStack = document.getElementById('cardStack');
    if (cardStack) {
      cardStack.style.overflow = 'visible';
    }
    
    // Log to verify it was added
    console.log('Added notification badge to card');
  }
  
  // Execute after DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addCardNotification, 1000);
  });
  
  // Helper function to show both badges to debug positioning
  function debugNotificationBadges(count) {
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
  }
  
  // Export debugging function to global scope
  globalThis.debugCardBadges = debugNotificationBadges;