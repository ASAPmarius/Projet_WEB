// Self-executing function to fix chat input issues
(function() {
    // Function to ensure chat input works properly
    function fixChatInput() {
      const messageInput = document.getElementById('messageInput');
      
      if (!messageInput) {
        // If input not found, try again in a moment
        setTimeout(fixChatInput, 100);
        return;
      }
      
      // Ensure the input has high z-index and is focusable
      messageInput.style.zIndex = "1100";
      messageInput.style.position = "relative";
      
      // Clear any potential pointer-event issues
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
      const container = document.querySelector('.container');
      const chatbox = document.querySelector('.chatbox');
      
      if (container) container.style.pointerEvents = "auto";
      if (chatbox) chatbox.style.pointerEvents = "auto";
    }
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixChatInput);
    } else {
      fixChatInput();
    }
    
    // Also run the fix after a short delay to ensure it applies after other scripts
    setTimeout(fixChatInput, 500);
  })();