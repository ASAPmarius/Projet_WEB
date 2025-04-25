// Self-executing function to avoid polluting the global scope
(function() {
  // Function to initialize chat toggle
  function initChatToggle() {
    // Create chat toggle button if it doesn't exist
    if (!document.getElementById('chatToggle')) {
      const chatToggle = document.createElement('div');
      chatToggle.className = 'chat-toggle';
      chatToggle.id = 'chatToggle';
      document.body.appendChild(chatToggle);
      
      // Get container element
      const container = document.querySelector('.container');
      if (!container) return;
      
      // Initialize chat state from localStorage (default to visible)
      const chatHidden = localStorage.getItem('chatHidden') === 'true';
      if (chatHidden) {
        container.classList.add('chat-hidden');
        chatToggle.classList.add('chat-hidden');
        // No longer updating poker table class
      }
      
      // Toggle chat visibility when button is clicked
      chatToggle.addEventListener('click', function() {
        // Toggle classes ONLY on chat elements, not the table
        container.classList.toggle('chat-hidden');
        chatToggle.classList.toggle('chat-hidden');
        
        // Save state to localStorage
        const isHidden = container.classList.contains('chat-hidden');
        localStorage.setItem('chatHidden', isHidden.toString());
      });
    }
  }
  
  // Add chat toggle button after DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatToggle);
  } else {
    initChatToggle();
  }
  
  // Enhance the existing initialize function to ensure
  // we always have the toggle button initialized
  const originalInitPokerTable = globalThis.initPokerTable;
  if (typeof originalInitPokerTable === 'function') {
    globalThis.initPokerTable = function() {
      // Call the original function
      originalInitPokerTable();
      
      // Make sure toggle is initialized
      setTimeout(initChatToggle, 100);
    };
  }
})();