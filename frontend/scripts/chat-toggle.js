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
          
          // Also update poker table if it exists
          const pokerTable = document.getElementById('pokerTableContainer');
          if (pokerTable) {
            pokerTable.classList.add('chat-hidden');
          }
        }
        
        // Toggle chat visibility when button is clicked
        chatToggle.addEventListener('click', function() {
          // Toggle classes
          container.classList.toggle('chat-hidden');
          chatToggle.classList.toggle('chat-hidden');
          
          // Also toggle poker table if it exists
          const pokerTable = document.getElementById('pokerTableContainer');
          if (pokerTable) {
            pokerTable.classList.toggle('chat-hidden');
          }
          
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
    
    // Function to check and update chat toggle position when table is created
    globalThis.updateChatToggleWithTable = function() {
      const chatToggle = document.getElementById('chatToggle');
      const pokerTable = document.getElementById('pokerTableContainer');
      
      if (chatToggle && pokerTable) {
        const isHidden = localStorage.getItem('chatHidden') === 'true';
        if (isHidden) {
          pokerTable.classList.add('chat-hidden');
        }
      }
    };
    
    // Enhance the existing initialize function
    const originalInitPokerTable = globalThis.initPokerTable;
    if (typeof originalInitPokerTable === 'function') {
      globalThis.initPokerTable = function() {
        // Call the original function
        originalInitPokerTable();
        
        // Update the chat toggle
        setTimeout(globalThis.updateChatToggleWithTable, 100);
      };
    }
  })();