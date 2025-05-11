// Frontend configuration module
const config = (function() {
  // Detect if we're in production based on the URL
  const isProduction = 
    globalThis.location.hostname !== 'localhost' && 
    !globalThis.location.hostname.includes('127.0.0.1');
  
  // Base domain - use current domain in production, localhost in development
  const domain = isProduction ? globalThis.location.hostname : 'localhost';
  
  // Port configuration
  const frontendPort = isProduction ? globalThis.location.port || '' : '8080';
  const backendPort = isProduction ? '' : '3000'; // In production, the backend might not have a specific port
  
  // Protocol (http/https)
  const protocol = isProduction || globalThis.location.protocol === 'https:' ? 'https' : 'http';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
  
  // Build the complete URLs
  const frontendUrl = `${protocol}://${domain}${frontendPort ? ':' + frontendPort : ''}`;
  
  // In production, the backend might be at the same domain but different path,
  // or it could be a completely different domain based on your deployment
  const backendUrl = isProduction 
    ? (globalThis.BACKEND_URL || `https://caracaca-backend-app-50a2aebeae3d.herokuapp.com/`)
    : `http://localhost:3000`;
  
  // WebSocket URL
  const websocketUrl = isProduction 
    ? `${wsProtocol}://${domain}${backendPort ? ':' + backendPort : ''}`
    : `ws://localhost:3000`;
  
  console.log('Frontend Config:', {
    environment: isProduction ? 'production' : 'development',
    frontendUrl,
    backendUrl,
    websocketUrl
  });
  
  return {
    isProduction,
    frontendUrl,
    backendUrl,
    websocketUrl,
    apiEndpoint: function(path) {
      // Helper to build complete API URLs
      return `${backendUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    }
  };
})();

// Make the config globally available
globalThis.appConfig = config;
