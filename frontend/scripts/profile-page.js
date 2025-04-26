// scripts/hello-page.js
function goBackToGame() {
    // Using history.back() instead of direct navigation to prevent WebSocket issues
    history.back();
}