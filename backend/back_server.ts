import { loadSync } from 'dotenv';
console.log('About to load .env file');
const env = loadSync();
console.log('Loaded .env file:');

for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value); //this line is crucial
}

import { Application, Context, Router } from 'oak';
import { cors, type CorsOptions } from 'cors';
import * as bcrypt from 'bcrypt';
import { create, verify } from 'djwt';
import { Client } from 'postgres';
import { base64ToBytes, bytesToDataURL, convertImageToBytes } from './convertIMG.ts';
import { CardService } from "./card_service.ts";
import { GameState, User, Connection, WebSocketMessage, ChatMessage, Card, Game , CardMetadata} from "./models.ts";

// Global error handler
addEventListener("error", (event) => {
  console.error("Global error caught:", event.error);
});

// Unhandled rejection handler
addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Initialize router and application
const router = new Router();
const app = new Application();

const client = new Client({
  user: getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD'),
  database: getEnv('DB_NAME'),
  hostname: getEnv('DB_HOST'),
  port: Number(getEnv('DB_PORT')),
});

try {
  await client.connect();
  console.log('Connected to PostgreSQL database');
} catch (error) {
  console.error('Failed to connect to database:', error);
}

// Initialize card service
const cardService = new CardService(client);


let defaultProfilePictureCache: Uint8Array | null = null;

async function initDefaultProfilePicture(): Promise<void> {
  try {
    console.log('Loading default profile picture...');
    defaultProfilePictureCache = await convertImageToBytes('./defaultPP.jpg');
    console.log('Default profile picture loaded successfully!');
  } catch (error) {
    console.error('Failed to load default profile picture:', error);
    defaultProfilePictureCache = null;
  }
}

async function getDefaultProfilePicture(): Promise<Uint8Array> {
  // If we already have the default picture in cache, return it
  if (defaultProfilePictureCache) {
    return defaultProfilePictureCache;
  }
  
  // Otherwise, try to load it from the file
  try {
    defaultProfilePictureCache = await convertImageToBytes('./defaultPP.jpg');
    return defaultProfilePictureCache;
  } catch (error) {
    console.error('Error loading default profile picture:', error);
    // Return an empty Uint8Array as fallback
    return new Uint8Array();
  }
}

await initDefaultProfilePicture();

addEventListener('unload', async () => {
  console.log('🛑 Shutting down — disconnecting Postgres');
  await client.end();
});

let secretKey: CryptoKey;

try {
  // Get the JWT secret from environment
  const jwtSecret = getEnv('SECRET_KEY');
  
  // Convert the string to a Uint8Array
  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(jwtSecret);
  
  // Import the key
  secretKey = await crypto.subtle.importKey(
    'raw',
    secretKeyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false, // extractable
    ['sign', 'verify']
  );
  
  console.log('JWT secret key imported successfully');
} catch (error) {
  console.error('Failed to import JWT secret key:', error);
  throw new Error('Server configuration error: JWT_SECRET missing or invalid');
}

// Helper function for safely converting binary data to base64
function safelyConvertToBase64(binaryData: Uint8Array | null | undefined): string {
  if (!binaryData) {
    console.warn("Missing binary data for base64 conversion");
    return "";
  }
  
  try {
    // Use a safer approach to convert Uint8Array to base64
    return btoa(
      Array.from(new Uint8Array(binaryData))
        .map(b => String.fromCharCode(b))
        .join('')
    );
  } catch (error) {
    console.error("Error converting binary data to base64:", error);
    return "";
  }
}

await initDefaultProfilePicture();

// Function to check the tokens received by websocket messages
const is_authorized = async (auth_token: string) => {
  if (!auth_token) {
    return false;
  }
  if (auth_token in tokens) {
    try {
      const payload = await verify(auth_token, secretKey);
      if (payload.userName === tokens[auth_token]) {
        return true;
      }
    } catch {
      console.log('verify token failed');
      return false;
    }
  }
  console.log('Unknown token');
  return false;
};

// Update the authorizationMiddleware to better handle tokens and debugging
const authorizationMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
  const cookie = ctx.request.headers.get('cookie');
  const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];

  // Also check Authorization header as fallback (for clients not using cookies)
  const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
  
  const tokenToUse = authToken || headerToken;

  if (!tokenToUse) {
    console.log('No token found in request');
    ctx.response.status = 401;
    ctx.response.body = { error: 'Unauthorized: Missing token' };
    return;
  }

  try {
    // Verify the token
    const tokenData = await verify(tokenToUse, secretKey);
    
    // Log token data for debugging (remove in production)
    console.log('Token verified successfully:', {
      userName: tokenData.userName,
      userId: tokenData.userId
    });
    
    // Ensure userId exists in token
    if (!tokenData.userId) {
      console.error('Token missing userId property');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token format' };
      return;
    }
    
    ctx.state.tokenData = tokenData;
    await next();
  } catch (error) {
    console.error('Token verification failed:', error);
    ctx.response.status = 401;
    ctx.response.body = { error: 'Unauthorized: Invalid token' };
  }
};

// Middleware to check if the user is already connected
const checkIfAlreadyConnected = async (ctx: Context, next: () => Promise<unknown>) => {
  const body = await ctx.request.body.json();
  const { username } = body;

  const isConnected = connections.some((conn) => conn.username === username);

  if (isConnected) {
    ctx.response.status = 403;
    ctx.response.body = { error: 'User is already connected' };
    return;
  }

  await next();
};

async function get_hash(password: string): Promise<string> {
  return await bcrypt.hash(password);
}

async function getUserById(userId: number): Promise<User | null> {
  const result = await client.queryObject<User>(
    'SELECT * FROM "User" WHERE "idUser" = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// Connection tracking
const connections: Connection[] = [];
const tokens: { [key: string]: string } = {};

function removeTokenByUser(user: string) {
  for (const token in tokens) {
    if (tokens[token] === user) {
      delete tokens[token];
      break;
    }
  }
}

async function getAllActiveGames(): Promise<Game[]> {
  const result = await client.queryObject<Game>(
    'SELECT g.* FROM "Game" g ' +
    'WHERE g."GameStatus" = \'active\' ' +
    'ORDER BY g."DateCreated" DESC'
  );
  return result.rows;
}

async function getUsersInActiveGame(gameId: number): Promise<User[]> {
  const result = await client.queryObject<User>(
    'SELECT u.* FROM "User" u ' +
    'INNER JOIN "Game_Users" gu ON u."idUser" = gu."idUsers" ' +
    'INNER JOIN "Game" g ON gu."idGame" = g."idGame" ' +
    'WHERE gu."idGame" = $1 AND g."GameStatus" = \'active\'',
    [gameId]
  );
  return result.rows;
}
async function getActiveGameForUser(userId: number): Promise<Game | null> {
  const result = await client.queryObject<Game>(
    'SELECT g.* FROM "Game" g ' +
    'INNER JOIN "Game_Users" gu ON g."idGame" = gu."idGame" ' +
    'WHERE gu."idUsers" = $1 AND g."GameStatus" = \'active\' ' +
    'ORDER BY g."DateCreated" DESC LIMIT 1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getGameById(gameId: number): Promise<number | null> {
  // Check if game exists and is active
  const result = await client.queryObject<{ idGame: number }>(
    'SELECT "idGame" FROM "Game" WHERE "idGame" = $1 AND "GameStatus" = \'active\'',
    [gameId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0].idGame;
}

async function joinExistingGame(userId: number, gameId: number): Promise<boolean> {
  try {
    console.log(`Attempting to join user ${userId} to game ${gameId}`);
    
    // Check if the game exists and is active
    const gameCheck = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Game" WHERE "idGame" = $1 AND "GameStatus" = \'active\'',
      [gameId]
    );
    
    console.log(`Game exists check: ${gameCheck.rows[0].count > 0}`);
    
    if (gameCheck.rows[0].count === 0) {
      console.log(`Game ${gameId} doesn't exist or isn't active`);
      return false;
    }
    
    // Check if user is already part of this game
    const userGameCheck = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Game_Users" WHERE "idUsers" = $1 AND "idGame" = $2',
      [userId, gameId]
    );
    
    console.log(`User already in game check: ${userGameCheck.rows[0].count > 0}`);
    
    if (userGameCheck.rows[0].count > 0) {
      // User is already part of this game, that's fine
      console.log(`User ${userId} is already in game ${gameId}, still returning success`);
      return true; // Return true since user is already in the game - this is NOT an error
    } else {
      // User is not part of this game, add them
      console.log(`Adding user ${userId} to game ${gameId}`);
      try {
        await client.queryObject(
          'INSERT INTO "Game_Users" ("idUsers", "idGame") VALUES ($1, $2)',
          [userId, gameId]
        );
        console.log(`User ${userId} successfully added to game ${gameId}`);
        return true;
      } catch (insertError) {
        console.error(`Failed to add user to game:`, insertError);
        throw insertError; // Re-throw to trigger the catch block
      }
    }
  } catch (error) {
    console.error(`Error joining game ${gameId}:`, error);
    return false;
  }
}

async function markGameAsFinished(gameId: number): Promise<void> {
  try {
    console.log(`Marking game ${gameId} as finished`);
    
    // First check if the game is already finished to avoid unnecessary updates
    const gameCheck = await client.queryObject<{ GameStatus: string }>(
      'SELECT "GameStatus" FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    if (gameCheck.rows.length === 0) {
      console.log(`Game ${gameId} not found, cannot mark as finished`);
      return;
    }
    
    if (gameCheck.rows[0].GameStatus === 'finished') {
      console.log(`Game ${gameId} is already marked as finished`);
      return;
    }
    
    // Update the game status to 'finished'
    await client.queryObject(
      'UPDATE "Game" SET "GameStatus" = \'finished\' WHERE "idGame" = $1',
      [gameId]
    );
    
    console.log(`Game ${gameId} successfully marked as finished`);
    
    // Once marked as finished, we can clean up the ActiveCards
    await cleanupFinishedGame(gameId);
  } catch (error) {
    console.error(`Error marking game ${gameId} as finished:`, error);
    throw error; // Re-throw so caller can handle if needed
  }
}

async function getUserByUsername(username: string): Promise<User | null> {
  const result = await client.queryObject<User>(
    'SELECT * FROM "User" WHERE "Username" = $1',
    [username]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function createUser(
  username: string, 
  password: string, 
  profilePicture: Uint8Array | null,
  bio: string | null = null,
  favoriteSong: string | null = null
): Promise<User> {
  const hashedPassword = await get_hash(password);
  if (!profilePicture) {
    profilePicture = await getDefaultProfilePicture();
  }
  
  const result = await client.queryObject<User>(
    'INSERT INTO "User" ("Username", "Password", "Profile_picture", "isAdmin", "Bio", "Favorite_song") ' +
    'VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [username, hashedPassword, profilePicture, false, bio, favoriteSong]
  );
  
  return result.rows[0];
}

async function addUserToGame(userId: number, gameId: number): Promise<void> {
  await client.queryObject(
    'INSERT INTO "Game_Users" ("idUsers", "idGame") VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, gameId]
  );
}

async function recordChatMessage(gameId: number, userId: number, textContent: string): Promise<ChatMessage> {
  const result = await client.queryObject<ChatMessage>(
    'INSERT INTO "ChatMessages" ("idGame", "idUser", "TextContent") VALUES ($1, $2, $3) RETURNING *',
    [gameId, userId, textContent]
  );
  return result.rows[0];
}

async function getUsersInGame(gameId: number): Promise<User[]> {
  const result = await client.queryObject<User>(
    'SELECT u.* FROM "User" u INNER JOIN "Game_Users" gu ON u."idUser" = gu."idUsers" WHERE gu."idGame" = $1',
    [gameId]
  );
  return result.rows;
}

// No need to initialize cards as they're already inserted
async function checkCardTypes(): Promise<void> {
  // Check how many cards exist
  const existingCards = await client.queryObject<{ count: number }>('SELECT COUNT(*) as count FROM "Cards"');
  console.log(`Found ${existingCards.rows[0].count} card types in database`);
}

// Cleanup function for finished games - Only delete ActiveCards
async function cleanupFinishedGame(gameId: number): Promise<void> {
  try {
    // Delete all active cards associated with this game
    await client.queryObject(
      'DELETE FROM "ActiveCards" WHERE "idGame" = $1',
      [gameId]
    );
    
    console.log(`Cleaned up ActiveCards for game ${gameId}`);
  } catch (error) {
    console.error(`Error cleaning up ActiveCards for game ${gameId}:`, error);
  }
}

// Check if a game is finished (all players disconnected)
async function checkAndCleanupFinishedGames(): Promise<void> {
  // Get all active games
  const activeGames = await client.queryObject<{ idGame: number }>(
    'SELECT "idGame" FROM "Game"'
  );
  
  for (const game of activeGames.rows) {
    // Check if there are any active players for this game
    const activeUsers = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Game_Users" gu ' +
      'INNER JOIN "User" u ON gu."idUsers" = u."idUser" ' +
      'WHERE gu."idGame" = $1 AND u."Username" IN (' +
      '  SELECT ws.username FROM unnest($2::text[]) as ws(username)' +
      ')',
      [game.idGame, connections.map(conn => conn.username)]
    );
    
    // If no active users, clean up the game's ActiveCards
    if (activeUsers.rows[0].count === 0 && game.idGame !== currentGameId) {
      await cleanupFinishedGame(game.idGame);
    }
  }
}

// Call this during server startup
await checkCardTypes();

// Cleanup any lingering ActiveCards from previous server sessions
await checkAndCleanupFinishedGames();

// Current game tracking
let currentGameId: number | null = null;

async function initializeGameState(gameId: number): Promise<GameState> {
  // Get the players in the game
  const players = await getUsersInGame(gameId);
  
  // Initialize with a more complete state
  const initialState: GameState = {
    phase: players.length >= 2 ? 'playing' : 'waiting',
    currentTurn: players.length > 0 ? players[0].idUser : null,
    round: 1,
    startTime: new Date(),
    lastActionTime: new Date(),
    // Add these required properties
    playerHands: {},
    playedCards: {},
    warPile: [],
    lastWinner: null,
    warRound: 0,
    inWar: false
  };
  
  console.log(`Initialized game state for game ${gameId}: ${JSON.stringify(initialState)}`);
  return initialState;
}

async function startGame(gameId: number): Promise<void> {
  try {
    // Get current game state or initialize if not exists
    let gameState = await getGameState(gameId);
    if (!gameState) {
      gameState = await initializeGameState(gameId);
    }
    
    // Change phase to playing
    gameState.phase = 'playing';
    
    // Get the players in the game
    const players = await getUsersInGame(gameId);
    
    if (players.length >= 2) {
      // Set the first player's turn (could be randomized)
      gameState.currentTurn = players[0].idUser;
      
      // Update the game state
      await updateGameState(gameId, gameState);
      
      // ADD THIS LINE: Initialize the game with cards for each player
      await initializeGame(gameId);
      
      // Notify all players that the game has started
      notifyGameUsers(gameId, {
        type: 'game_state',
        gameState: gameState
      });
      
      // Also notify specifically about the turn change
      notifyGameUsers(gameId, {
        type: 'turn_change',
        playerId: gameState.currentTurn,
        username: players[0].Username
      });
      
      console.log(`Game ${gameId} successfully started with ${players.length} players`);
    } else {
      throw new Error('Need at least 2 players to start the game');
    }
  } catch (error) {
    console.error(`Error starting game ${gameId}:`, error);
    throw error;
  }
}

async function getGameState(gameId: number): Promise<GameState | null> {
  try {
    // Check for an existing game state in the database
    const result = await client.queryObject<{ game_state: string | Record<string, any> }>(
      'SELECT "GameState" as game_state FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    if (result.rows.length === 0) {
      // No game state found
      return null;
    }
    
    // Handle case where game_state is already an object (no need to parse)
    if (!result.rows[0].game_state) {
      return null;
    }
    
    // Check if we need to parse the JSON
    if (typeof result.rows[0].game_state === 'string') {
      try {
        // Parse the stored JSON
        return JSON.parse(result.rows[0].game_state) as GameState;
      } catch (parseError) {
        console.error(`Error parsing game state JSON for game ${gameId}:`, parseError);
        
        // If parsing fails, create a new default game state
        console.log(`Creating default game state for game ${gameId} due to parsing error`);
        const newState = await initializeGameState(gameId);
        await updateGameState(gameId, newState);
        return newState;
      }
    } else {
      // It's already an object
      return result.rows[0].game_state as GameState;
    }
  } catch (error) {
    console.error(`Error getting game state for game ${gameId}:`, error);
    return null;
  }
}

async function updateGameState(gameId: number, gameState: GameState): Promise<void> {
  try {
    // Make sure we have a valid object
    if (!gameState || typeof gameState !== 'object') {
      console.error(`Invalid game state for game ${gameId}:`, gameState);
      return;
    }
    
    // Convert the game state to JSON string
    const gameStateJSON = JSON.stringify(gameState);
    
    // Update the game state in the database
    await client.queryObject(
      'UPDATE "Game" SET "GameState" = $1 WHERE "idGame" = $2',
      [gameStateJSON, gameId]
    );
    const gameStateWithoutSensitiveData = {
      ...gameState,
      playerHands: undefined,
      playedCards: Object.fromEntries(
      Object.entries(gameState.playedCards || {}).map(([playerId, card]) => [
        playerId, { ...card, picture: undefined }
      ])
      )
    };

    console.log(`Updated game state for game ${gameId}:`, JSON.stringify(gameStateWithoutSensitiveData, null, 2));
  } catch (error) {
    console.error(`Error updating game state for game ${gameId}:`, error);
    throw error;
  }
}

async function handleJoinGame(data: any, userId: number, ws: WebSocket) {
  const { gameId } = data;
  
  if (!gameId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID"
    }));
    return;
  }
  
  try {
    console.log(`User ${userId} joining game ${gameId}`);
    
    // Add user to game
    await addUserToGame(userId, gameId);
    
    // Find this connection in the connections array
    const connIndex = connections.findIndex(c => c.userId === userId);
    
    if (connIndex !== -1) {
      console.log(`Updating connection for user ${userId}: setting gameId to ${gameId}`);
      connections[connIndex].gameId = Number(gameId);
    } else {
      console.warn(`Connection not found for user ${userId} when joining game ${gameId}`);
    }
    
    // Log connections after update
    console.log(`Current connections after join:`);
    connections.forEach(conn => {
      console.log(`- User: ${conn.username}, ID: ${conn.userId}, Game: ${conn.gameId}`);
    });
    
    // Send success response
    ws.send(JSON.stringify({
      type: "join_game_success",
      gameId
    }));
    
    // Update connected users
    sendConnectedUsers(gameId);
    
    // Send game state
    sendGameState(gameId, ws);
  } catch (error) {
    console.error("Error joining game:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to join game"
    }));
  }
}

async function handlePlayerAction(data: any, userId: number, username: string, ws: WebSocket) {
  const { gameId, action } = data;
  
  if (!gameId || !action) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or action"
    }));
    return;
  }
  
  try {
    // Get current game state
    const gameState = await getGameState(gameId);
    
    // Validate action (e.g., check if it's player's turn)
    if (gameState && gameState.phase === "playing" && gameState.currentTurn !== null) {
      if (gameState.currentTurn !== userId) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Not your turn"
        }));
        return;
      }
    }

    if (action.type === 'play_card' && action.cardId) {
      await handlePlayCard(gameId, userId, action.cardId);
    }
    
    // THIS IS THE CRITICAL PART - make sure this is broadcasting to everyone
    notifyGameUsers(gameId, {
      type: "player_action",
      playerId: userId,
      username,
      action
    });
    
    // Update last action time in game state
    if (gameState) {
      gameState.lastActionTime = new Date();
      await updateGameState(gameId, gameState);
    }
  } catch (error) {
    console.error("Error handling player action:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to process action"
    }));
  }
}

async function handleChatMessage(data: any, userId: number, username: string) {
  const { gameId, message } = data;
  
  if (!gameId || !message) {
    return;
  }
  
  try {
    // Record chat message in database
    await recordChatMessage(gameId, userId, message);
    
    // Get user profile picture
    const user = await getUserById(userId);
    let profilePicture = "";
    
    if (user && user.Profile_picture) {
      profilePicture = bytesToDataURL(user.Profile_picture, "image/png");
    }
    
    // Broadcast message to all users in game
    notifyGameUsers(gameId, {
      type: "message",
      message,
      owner: username,
      user_pp_path: profilePicture,
      userId
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
  }
}

async function handleSyncRequest(data: any, ws: WebSocket) {
  const { gameId } = data;
  
  if (!gameId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID"
    }));
    return;
  }
  
  try {
    // Send game state
    sendGameState(gameId, ws);
    
    // Send connected users
    const usersInGame = await getUsersInGame(gameId);
    
    const connectedUsersData = await Promise.all(usersInGame.map(async (user) => {
      let ppPath = "";
      if (user.Profile_picture) {
        ppPath = bytesToDataURL(user.Profile_picture, "image/png");
      }
      
      return {
        id: user.idUser,
        username: user.Username,
        pp_path: ppPath,
        connected: connections.some(conn => conn.userId === user.idUser)
      };
    }));
    
    ws.send(JSON.stringify({
      type: "connected_users",
      users: connectedUsersData
    }));
  } catch (error) {
    console.error("Error handling sync request:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to sync game data"
    }));
  }
}

async function handleGameStateUpdate(data: any, userId: number, ws: WebSocket) {
  const { gameId, gameState } = data;
  
  if (!gameId || !gameState) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or game state data"
    }));
    return;
  }
  
  try {
    // Get current game state from database
    const currentGameState = await getGameState(gameId);
    if (!currentGameState) {
      throw new Error("Game state not found");
    }
    
    // Update only the specified fields
    const updatedGameState = { ...currentGameState };
    
    // Update round if provided
    if (gameState.round !== undefined) {
      updatedGameState.round = gameState.round;
      console.log(`Updating game ${gameId} round to ${gameState.round}`);
    }
    
    // Update other fields as needed
    if (gameState.phase !== undefined) {
      updatedGameState.phase = gameState.phase;
    }
    
    // Save updated game state
    await updateGameState(gameId, updatedGameState);
    
    // Broadcast updated game state to all players
    notifyGameUsers(gameId, {
      type: "game_state",
      gameState: updatedGameState
    });
  } catch (error) {
    console.error("Error updating game state:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to update game state"
    }));
  }
}

async function handleRoundUpdate(data: any, userId: number, ws: WebSocket) {
  const { gameId, round } = data;
  
  if (!gameId || !round) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or round number"
    }));
    return;
  }
  
  try {
    console.log(`Updating round for game ${gameId} to ${round}`);
    
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      throw new Error("Game state not found");
    }
    
    // Update round
    gameState.round = round;
    
    // Save updated game state
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the updated game state
    notifyGameUsers(gameId, {
      type: "game_state",
      gameState
    });
  } catch (error) {
    console.error("Error updating round:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to update round"
    }));
  }
}

async function handleTurnChange(data: any, userId: number, username: string, ws: WebSocket) {
  const { gameId, playerId } = data;
  
  if (!gameId || !playerId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or player ID"
    }));
    return;
  }
  
  try {
    console.log(`Turn change: Game ${gameId}, Player ${playerId} (${username})`);
    
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      throw new Error("Game state not found");
    }
    
    // Update turn
    gameState.currentTurn = Number(playerId);
    gameState.lastActionTime = new Date();
    
    // Save updated game state
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the turn change
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId,
      username: data.username || username
    });
  } catch (error) {
    console.error("Error handling turn change:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to process turn change"
    }));
  }
}

async function loadAllCardsWithMetadata(): Promise<CardMetadata[]> {
  try {
    // Load all cards from database
    const cards = await client.queryObject<Card>(
      'SELECT * FROM "Cards" ORDER BY "idCardType"'
    );
    
    if (!cards.rows.length) {
      console.error('No cards found in database');
      return [];
    }
    
    // Convert DB cards to cards with metadata
    const cardsWithMetadata: CardMetadata[] = cards.rows.map(card => {
      // Extract metadata based on card ID
      const metadata = getCardMetadata(card.idCardType);
      
      // Convert binary image to data URL
      const imageData = bytesToDataURL(card.Picture, 'image/png');
      
      // Create the card metadata object
      return {
        id: card.idCardType,
        suit: metadata.suit,
        rank: metadata.rank,
        value: metadata.value,
        picture: imageData
      };
    });
    
    console.log(`Loaded ${cardsWithMetadata.length} cards with metadata`);
    return cardsWithMetadata;
  } catch (error) {
    console.error('Error loading cards with metadata:', error);
    return [];
  }
}

// Helper function to get card metadata
function getCardMetadata(cardTypeId: number): { suit: string; rank: string; value: number } {
  // Card IDs 1-52 are standard playing cards
  if (cardTypeId < 1 || cardTypeId > 54) {
    return { suit: 'unknown', rank: 'unknown', value: 0 };
  }
  
  // Card ID 53 is joker, 54 is card back
  if (cardTypeId === 53) {
    return { suit: 'special', rank: 'joker', value: 0 };
  }
  
  if (cardTypeId === 54) {
    return { suit: 'special', rank: 'back', value: 0 };
  }
  
  // For standard cards (1-52)
  // Suit: 1-13 = hearts, 14-26 = diamonds, 27-39 = clubs, 40-52 = spades
  // Rank: Each suit starts with 2 and ends with Ace
  
  let suitIndex = Math.floor((cardTypeId - 1) / 13);
  let rankIndex = (cardTypeId - 1) % 13;
  
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // Values for comparison (Ace high)
  
  return {
    suit: suits[suitIndex],
    rank: ranks[rankIndex],
    value: values[rankIndex]
  };
}

async function advanceTurn(gameId: number): Promise<void> {
  try {
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      console.error(`Game state not found for game ${gameId}`);
      return;
    }
    
    // Get all players in the game
    const players = await getUsersInGame(gameId);
    if (players.length < 2) {
      console.error(`Not enough players in game ${gameId} to advance turn`);
      return;
    }
    
    // Find current player index
    const currentTurn = gameState.currentTurn;
    const currentPlayerIndex = players.findIndex(p => Number(p.idUser) === Number(currentTurn));
    
    if (currentPlayerIndex === -1) {
      console.error(`Current turn player ${currentTurn} not found in players list`);
      return;
    }
    
    // Calculate next player index
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayerId = players[nextPlayerIndex].idUser;
    
    console.log(`Advancing turn from player ${currentTurn} to player ${nextPlayerId}`);
    
    // Update game state
    gameState.currentTurn = nextPlayerId;
    gameState.lastActionTime = new Date();
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the turn change
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId: nextPlayerId,
      gameId: gameId,
      username: players[nextPlayerIndex].Username
    });
    
    console.log(`Turn advanced for game ${gameId}`);
  } catch (error) {
    console.error(`Error advancing turn for game ${gameId}:`, error);
  }
}

async function handlePlayCard(gameId: number, playerId: number, cardId: number): Promise<boolean> {
  // Get current game state
  const gameState = await getGameState(gameId);
  if (!gameState) return false;
  
  // Ensure we're tracking player hands
  if (!gameState.playerHands) {
    gameState.playerHands = {};
  }
  
  // Ensure we're tracking played cards
  if (!gameState.playedCards) {
    gameState.playedCards = {};
  }
  
  // Validate it's the player's turn
  if (gameState.currentTurn !== playerId) {
    return false;
  }
  
  // Check if player already played a card
  if (gameState.playedCards[playerId]) {
    return false;
  }
  
  // Get player's hand
  const hand = gameState.playerHands[playerId] || [];
  
  // Find the card
  const cardIndex = hand.findIndex(card => card.id === cardId);
  if (cardIndex === -1) return false;
  
  // Get the card
  const card = hand[cardIndex];
  
  // Remove from hand
  hand.splice(cardIndex, 1);
  
  // Add to played cards
  gameState.playedCards[playerId] = card;
  
  // Update game state
  await updateGameState(gameId, gameState);

  const user = await getUserById(playerId);
  const username = user ? user.Username : "Unknown";
  
  // Notify all clients
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId,
    username,
    action: {
      type: "play_card",
      cardId
    }
  });
  
  // Check if round should be resolved
  if (Object.keys(gameState.playedCards).length === 2) {
    resolveRound(gameId);
  } else {
    // Advance to next player's turn
    advanceTurn(gameId);
  }
  
  return true;
}

async function handleWarCardPlay(gameId: number, playerId: number, cardId: number): Promise<void> {
  // Similar to handlePlayCard but with war-specific logic
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // Check if player has already played
  if (gameState.playedCards[playerId]) {
    console.log(`Player ${playerId} already played a card in this war round`);
    return;
  }
  
  // Get player's hand
  const hand = gameState.playerHands[playerId] || [];
  
  // Find the card
  const cardIndex = hand.findIndex(card => card.id === cardId);
  if (cardIndex === -1) {
    console.warn(`Card ${cardId} not found in player ${playerId}'s hand`);
    return;
  }
  
  // Get the card
  const card = hand[cardIndex];
  
  // Remove from hand
  hand.splice(cardIndex, 1);
  
  // Add to played cards
  gameState.playedCards[playerId] = card;
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Notify about the card play
  const users = await getUsersInGame(gameId);
  const player = users.find(u => Number(u.idUser) === Number(playerId));
  
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId,
    username: player ? player.Username : "Unknown",
    action: {
      type: "play_card",
      cardId,
      warMode: true
    }
  });
  
  // Check if both players have played their war cards
  if (Object.keys(gameState.playedCards).length === 2) {
    // Resolve the war
    setTimeout(() => resolveRound(gameId), 1000);
  } else {
    // Set the other player's turn
    const playerIds = Object.keys(gameState.playerHands).map(Number);
    const otherPlayerId = playerIds.find(id => id !== playerId);
    
    if (otherPlayerId) {
      gameState.currentTurn = otherPlayerId;
      await updateGameState(gameId, gameState);
      
      const otherPlayer = users.find(u => Number(u.idUser) === Number(otherPlayerId));
      if (otherPlayer) {
        notifyGameUsers(gameId, {
          type: "turn_change",
          playerId: otherPlayerId,
          username: otherPlayer.Username,
          warMode: true
        });
      }
    }
  }
}

async function resolveRound(gameId: number): Promise<void> {
  // Get current game state
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // Get the played cards
  const playedCards = gameState.playedCards || {};
  if (Object.keys(playedCards).length !== 2) return;

  const playerIds = Object.keys(playedCards).map(Number);
  const player1Id = playerIds[0];
  const player2Id = playerIds[1];

  // Ensure both players have cards in hand
  if (!gameState.playerHands[player1Id] || !gameState.playerHands[player2Id]) {
    console.error(`One or both players don't have hands`);
    return;
  }

  // Add null checks
  const card1 = playedCards[player1Id];
  const card2 = playedCards[player2Id];

  if (!card1 || !card2) {
    console.error('Missing played cards for one or both players');
    return;
  }

  // Initialize war pile if not already done
  if (!gameState.warPile) {
    gameState.warPile = [];
  }
  
  // Add played cards to war pile
  gameState.warPile.push(card1, card2);
  
  // Compare cards to determine winner
  let result = 0;
  if (card1.value > card2.value) {
    result = 1; // Player 1 wins
  } else if (card1.value < card2.value) {
    result = 2; // Player 2 wins
  } else {
    result = 0; // War (tie)
  }
  
  // Handle the result
  if (result === 0) {
    // WAR - Players tied!
    console.log(`WAR between players ${player1Id} and ${player2Id}`);
    
    // Check if players have enough cards for war
    if (gameState.playerHands[player1Id].length < 2 || gameState.playerHands[player2Id].length < 2) {
      // Not enough cards for war, determine winner based on who has more cards
      const winnerId = gameState.playerHands[player1Id].length > gameState.playerHands[player2Id].length 
                      ? player1Id : player2Id;
      
      // Award all cards to winner
      handleWarEnd(gameId, gameState, winnerId, "not enough cards for war");
      return;
    }
    
    // Set up for war
    gameState.inWar = true;
    gameState.warRound = (gameState.warRound || 0) + 1;
    
    // Clear played cards to prepare for next round
    gameState.playedCards = {};
    
    // Update game state
    await updateGameState(gameId, gameState);
    
    // Notify clients about war
    notifyGameUsers(gameId, {
      type: "war_start",
      warRound: gameState.warRound,
      warPileSize: gameState.warPile.length
    });
    
    // Request war cards from both players
    setTimeout(() => {
      requestWarCards(gameId, player1Id, player2Id);
    }, 1000);
    
    return;
  }
  
  // Normal round win - no war
  const winnerId = result === 1 ? player1Id : player2Id;
  handleWarEnd(gameId, gameState, winnerId, "normal win");
}

// Handle the end of a war (or regular round)
async function handleWarEnd(gameId: number, gameState: GameState, winnerId: number, reason: string): Promise<void> {
  // Get winner's hand
  if (!gameState.playerHands[winnerId]) {
    gameState.playerHands[winnerId] = [];
  }
  
  // Award all cards in war pile to winner
  const cardsWon = [...gameState.warPile];
  gameState.playerHands[winnerId].push(...cardsWon);

  // Log both players' hands without the 'picture' property
  const playerHandsWithoutPictures = Object.entries(gameState.playerHands).map(([playerId, hand]) => ({
    playerId,
    hand: hand.map(({ id, suit, rank, value }) => ({ id, suit, rank, value }))
  }));

  console.log("Player hands without pictures:", playerHandsWithoutPictures);
  
  // Clear war state
  gameState.inWar = false;
  gameState.warRound = 0;
  gameState.warPile = [];
  gameState.playedCards = {};
  
  // Update round
  gameState.round = (gameState.round || 1) + 1;
  gameState.lastWinner = winnerId;
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Get winner name
  const users = await getUsersInGame(gameId);
  const winner = users.find(u => Number(u.idUser) === Number(winnerId));
  
  // Notify all clients about the round result
  notifyGameUsers(gameId, {
    type: "round_result",
    winnerId: winnerId,
    winnerName: winner ? winner.Username : "Unknown",
    cardCount: cardsWon.length,
    newRound: gameState.round,
    reason: reason
  });
  
  // Check for game end conditions
  checkGameEndCondition(gameId, gameState);
  
  // Set winner as next player
  gameState.currentTurn = winnerId;
  await updateGameState(gameId, gameState);
  
  // Notify about turn change
  if (winner) {
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId: winnerId,
      username: winner.Username
    });
  }
}

async function requestWarCards(gameId: number, player1Id: number, player2Id: number): Promise<void> {
  // Get game state
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // For each player, take one face-down card
  const player1Hand = gameState.playerHands[player1Id];
  const player2Hand = gameState.playerHands[player2Id];
  
  if (!player1Hand || !player2Hand) {
    console.error("Missing player hands");
    return;
  }
  
  // Take face-down cards if available
  if (player1Hand.length > 0) {
    const faceDownCard = player1Hand.shift();
    if (faceDownCard) gameState.warPile.push(faceDownCard);
  }
  
  if (player2Hand.length > 0) {
    const faceDownCard = player2Hand.shift();
    if (faceDownCard) gameState.warPile.push(faceDownCard);
  }
  
  // Set both players to play their next card
  gameState.playedCards = {};
  gameState.currentTurn = player1Id; // Set first player to go
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Notify players to play their face-up cards
  const users = await getUsersInGame(gameId);
  const player1 = users.find(u => Number(u.idUser) === Number(player1Id));
  
  if (player1) {
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId: player1Id,
      username: player1.Username,
      warMode: true
    });
  }
  
  // Notify about war progress
  notifyGameUsers(gameId, {
    type: "war_progress",
    warRound: gameState.warRound,
    warPileSize: gameState.warPile.length,
    message: "Place face-up card"
  });
}

async function checkGameEndCondition(gameId: number, gameState: GameState): Promise<boolean> {
  // Check if any player has no cards left
  for (const [playerId, hand] of Object.entries(gameState.playerHands)) {
    if (hand.length === 0) {
      // Find winner (player with cards)
      const winnerPlayerId = Object.entries(gameState.playerHands)
        .find(([_, playerHand]) => playerHand.length > 0)?.[0];
        
      if (winnerPlayerId) {
        const users = await getUsersInGame(gameId);
        const winnerUser = users.find(u => String(u.idUser) === String(winnerPlayerId));
        
        // Update game status
        gameState.phase = 'finished';
        await updateGameState(gameId, gameState);
        
        // Notify about game end
        notifyGameUsers(gameId, {
          type: "game_end",
          winnerId: Number(winnerPlayerId),
          winnerName: winnerUser ? winnerUser.Username : "Unknown"
        });
        
        return true;
      }
    }
  }
  
  return false;
}

async function initializeGame(gameId: number): Promise<void> {
  // Get the game
  const game = await getGameById(gameId);
  if (!game) return;
  
  // Get players
  const players = await getUsersInGame(gameId);
  if (players.length < 2) return;
  
  // Create game state if it doesn't exist
  let gameState = await getGameState(gameId);
  if (!gameState) {
    gameState = {
      phase: 'playing',
      currentTurn: players[0].idUser,
      round: 1,
      startTime: new Date(),
      lastActionTime: new Date(),
      playerHands: {},
      playedCards: {},
      warPile: [],
      lastWinner: null,
      warRound: 0,
      inWar: false
    };
  }
  
  const cards = await loadAllCardsWithMetadata();
  const deck = cards.filter((card: CardMetadata) => card.id >= 1 && card.id <= 52);
  
  // Shuffle the deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  // Divide cards between players
  const halfDeck = Math.floor(deck.length / 2);
  
  gameState.playerHands = {};
  players.forEach((player, index) => {
    if (index === 0) {
      gameState.playerHands[player.idUser] = deck.slice(0, halfDeck);
    } else if (index === 1) {
      gameState.playerHands[player.idUser] = deck.slice(halfDeck);
    } else {
      gameState.playerHands[player.idUser] = [];
    }
  });
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Notify all players
  notifyGameUsers(gameId, {
    type: "game_state",
    gameState
  });
}

// Helper function to send game state
async function sendGameState(gameId: number, ws: WebSocket) {
  try {
    const gameState = await getGameState(gameId);
    
    ws.send(JSON.stringify({
      type: "game_state",
      gameState
    }));
  } catch (error) {
    console.error("Error sending game state:", error);
  }
}

// Helper function to send connected users
async function sendConnectedUsers(gameId: number) {
  try {
    const usersInGame = await getUsersInGame(gameId);
    
    const connectedUsersData = await Promise.all(usersInGame.map(async (user) => {
      let ppPath = "";
      if (user.Profile_picture) {
        ppPath = bytesToDataURL(user.Profile_picture, "image/png");
      }
      
      return {
        id: user.idUser,
        username: user.Username,
        pp_path: ppPath,
        connected: connections.some(conn => conn.userId === user.idUser)
      };
    }));
    
    notifyGameUsers(gameId, {
      type: "connected_users",
      users: connectedUsersData
    });
  } catch (error) {
    console.error("Error sending connected users:", error);
  }
}

function notifyGameUsers(gameId: number, message: any) {
  console.log(`Broadcasting message to all users in game ${gameId}:`, message.type);
  let sentCount = 0;
  
  // Debug client game IDs with their types
  console.log("Client game IDs:", connections.map(c => 
    `${c.username}: ${c.gameId} (${typeof c.gameId})`
  ));
  
  connections.forEach((client) => {
    // Convert both to the same type for comparison
    if (Number(client.gameId) === Number(gameId)) {
      try {
        client.ws.send(JSON.stringify(message));
        sentCount++;
        console.log(`Message sent to user ${client.username} (ID: ${client.userId})`);
      } catch (error) {
        console.error(`Error sending message to client ${client.username}:`, error);
      }
    } else {
      console.log(`Skipping client ${client.username} - gameId doesn't match: ${client.gameId} !== ${gameId}`);
    }
  });
  
  console.log(`Message broadcast complete: sent to ${sentCount} clients out of ${connections.length} total connections`);
}

// Add an OPTIONS handler for the login route
router.options('/login', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

router.post('/login', checkIfAlreadyConnected, async (ctx) => {
  // Manual CORS headers for login endpoint
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { username, password } = body;
  
  const user = await getUserByUsername(username);

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    return;
  }

  const result = await bcrypt.verify(password, user.Password);
  if (!result) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    console.log('Invalid username or password');
    return;
  }
  
  const token = await create({ alg: 'HS512', typ: 'JWT' }, { 
    userName: user.Username, 
    userId: user.idUser 
  }, secretKey);

  removeTokenByUser(username);
  tokens[token] = username;

  ctx.response.status = 200;
  ctx.response.headers.set(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`,
  );
  ctx.response.body = { status: 'success', auth_token: token };
});

// Add an OPTIONS handler for the create_account route
router.options('/create_account', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

router.post('/create_account', async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { username, password, profilePicture, bio, favoriteSong } = body;

  console.log("Creating account for user:", username);
  console.log("Profile picture provided:", profilePicture ? "Yes" : "No");
  console.log("Bio provided:", bio ? "Yes" : "No");
  console.log("Favorite song provided:", favoriteSong ? "Yes" : "No");

  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    console.log("Username already exists:", username);
    ctx.response.status = 400;
    ctx.response.body = { error: 'Username already exists' };
    return;
  }

  let profilePictureBytes: Uint8Array | null = null;

  // Convert base64 to bytes if profile picture was provided
  if (profilePicture) {
    try {
      console.log("Converting provided profile picture to binary");
      profilePictureBytes = base64ToBytes(profilePicture);
    } catch (error) {
      console.error('Error converting profile picture:', error);
      // If there's an error, we'll use null which will trigger default pic
      profilePictureBytes = null;
    }
  } else {
    console.log("Using default profile picture");
    // profilePictureBytes remains null - default will be used
  }

  try {
    // Use the updated createUser function with bio and favorite song
    const newUser = await createUser(
      username, 
      password, 
      profilePictureBytes,
      bio || null,
      favoriteSong || null
    );
    
    console.log("User created successfully:", newUser.idUser);

    ctx.response.status = 201;
    ctx.response.body = { status: 'success', user: { 
      idUser: newUser.idUser,
      Username: newUser.Username,
      isAdmin: newUser.isAdmin,
      Bio: newUser.Bio,
      Favorite_song: newUser.Favorite_song
    }};
  } catch (error) {
    console.error("Error creating user:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to create account' };
  }
});

router.post("/create-game", authorizationMiddleware, async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const userId = ctx.state.tokenData.userId;
  
  if (!userId) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing user ID" };
    return;
  }
  
  try {
    // Check if user already has an active game
    const existingGame = await getActiveGameForUser(userId);
    if (existingGame) {
      // User already has a game, return it
      ctx.response.status = 200;
      ctx.response.body = { game: existingGame };
      return;
    }
    
    // Create a new game with minimal state
    const result = await client.queryObject<{ idGame: number }>(
      'INSERT INTO "Game" ("GameType", "GameStatus", "GameState") VALUES ($1, $2, $3) RETURNING "idGame"',
      [
        "war", 
        "active", 
        JSON.stringify({
          phase: "waiting",
          currentTurn: null,
          round: 1,
          startTime: new Date()
        })
      ]
    );
    
    const gameId = result.rows[0].idGame;
    
    // Add user to the game
    await addUserToGame(userId, gameId);
    
    // Get the game to return it
    const game = await client.queryObject<any>(
      'SELECT * FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { game: game.rows[0] };
  } catch (error) {
    console.error("Error creating game:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create game" };
  }
});

router.get('/get_cookie', async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Generate JWT token
    const token = await create({ alg: 'HS512', typ: 'JWT' }, { userName: 'dummy' }, secretKey);

    // Set the token in an HTTP-only cookie
    ctx.response.headers.set(
      'Set-Cookie',
      `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`,
    );

    // Return success
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (_error) {
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error.' };
  }
});

router.get('/games', async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const activeGames = await getAllActiveGames();
    
    // For each game, get the players
    const gamesWithPlayers = await Promise.all(activeGames.map(async (game) => {
      const players = await getUsersInActiveGame(game.idGame);
      return {
        ...game,
        players: players.map(p => ({ 
          id: p.idUser,
          username: p.Username
        }))
      };
    }));
    
    ctx.response.status = 200;
    ctx.response.body = { games: gamesWithPlayers };
  } catch (error) {
    console.error('Error fetching active games:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to fetch active games' };
  }
});

router.post('/finish-game', authorizationMiddleware, async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { gameId } = body;
  
  if (!gameId) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Missing game ID' };
    return;
  }
  
  try {
    await markGameAsFinished(gameId);
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error(`Error finishing game ${gameId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to finish game' };
  }
});

// Enhanced active-game endpoint with player card counts
// Add OPTIONS handler for active-game
router.options('/active-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Improve the active-game endpoint further
router.get('/active-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token from multiple sources
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    const tokenToUse = authToken || headerToken;
    
    if (!tokenToUse) {
      console.log('No token provided for active-game check');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token directly in this endpoint
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
      console.log('Token verified in active-game endpoint:', tokenData);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    const userId = tokenData.userId;
    if (!userId) {
      console.error('Token missing userId');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing user ID in token' };
      return;
    }
    
    console.log(`Checking active game for user ${userId}`);
    
    // Check all games this user is part of
    const userGamesResult = await client.queryObject<{idGame: number}>(
      'SELECT gu."idGame" FROM "Game_Users" gu ' +
      'JOIN "Game" g ON gu."idGame" = g."idGame" ' +
      'WHERE gu."idUsers" = $1 AND g."GameStatus" = \'active\'',
      [userId]
    );
    
    console.log(`User ${userId} is part of ${userGamesResult.rows.length} active games`);
    
    // If user is not in any active games, return 404
    if (userGamesResult.rows.length === 0) {
      console.log(`No active games found for user ${userId}`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    // Get the most recent active game
    const gameIds = userGamesResult.rows.map(row => row.idGame);
    console.log('Active game IDs for user:', gameIds);
    
    const activeGameResult = await client.queryObject<Game>(
      'SELECT * FROM "Game" WHERE "idGame" = ANY($1::int[]) AND "GameStatus" = \'active\' ' +
      'ORDER BY "DateCreated" DESC LIMIT 1',
      [gameIds]
    );
    
    if (activeGameResult.rows.length === 0) {
      console.log(`No active games found for user ${userId} (double-check)`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    const activeGame = activeGameResult.rows[0];
    console.log(`Found active game ${activeGame.idGame} for user ${userId}`);
    
    // Double-check the game is indeed active
    if (activeGame.GameStatus !== 'active') {
      console.log(`Game ${activeGame.idGame} is not active, status: ${activeGame.GameStatus}`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    // Get players in this game
    const players = await getUsersInActiveGame(activeGame.idGame);
    const gameState = await getGameState(activeGame.idGame);

    ctx.response.status = 200;
    ctx.response.body = { 
      game: {
        ...activeGame,
        gameState: gameState
      }
    };
  } catch (error) {
    console.error('Error in active-game endpoint:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// Add OPTIONS handler for join-game
router.options('/join-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Improved join-game endpoint with explicit type conversions
// Improved join-game endpoint with explicit type conversions
router.post('/join-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token directly in this endpoint
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    const tokenToUse = authToken || headerToken;
    
    if (!tokenToUse) {
      console.log('No token provided for join-game');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
      console.log('Token verified in join-game endpoint:', tokenData);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    // Explicitly convert userId to number with proper type checking
    let userId: number;
    if (typeof tokenData.userId === 'number') {
      userId = tokenData.userId;
    } else if (typeof tokenData.userId === 'string') {
      userId = parseInt(tokenData.userId, 10);
      if (isNaN(userId)) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid user ID format in token' };
        return;
      }
    } else {
      console.error('Token has invalid userId type:', typeof tokenData.userId);
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing or invalid user ID in token' };
      return;
    }
    
    const body = await ctx.request.body.json();
    
    // Explicitly convert gameId to number with proper type checking
    let gameId: number;
    if (typeof body.gameId === 'number') {
      gameId = body.gameId;
    } else if (typeof body.gameId === 'string') {
      gameId = parseInt(body.gameId, 10);
      if (isNaN(gameId)) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid game ID format' };
        return;
      }
    } else {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing game ID' };
      return;
    }
    
    console.log(`Processing join request for user ${userId} to game ${gameId}`);
    
    // Use the joinExistingGame function with explicit number types
    const success = await joinExistingGame(userId, gameId);
    
    if (!success) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Game not found or not active' };
      return;
    }
    
    // Set current game ID (also convert to number for consistency)
    currentGameId = gameId;
    
    ctx.response.status = 200;
    ctx.response.body = { 
      success: true, 
      message: 'Successfully joined game',
      gameId: gameId
    };
  } catch (error) {
    console.error(`Error in join-game endpoint:`, error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

router.post('/start-game', authorizationMiddleware, async (ctx) => {
  // Set CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const { gameId } = body;
    
    if (!gameId) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing game ID' };
      return;
    }
    
    // Make sure the game exists
    const game = await getGameById(gameId);
    if (!game) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Game not found' };
      return;
    }
    
    // Check if user is in the game
    const userId = ctx.state.tokenData.userId;
    const usersInGame = await getUsersInGame(gameId);
    const userInGame = usersInGame.some(u => u.idUser === userId);
    
    if (!userInGame) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'You are not in this game' };
      return;
    }
    
    // Start the game
    await startGame(gameId);
    
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error('Error starting game:', error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: error instanceof Error ? error.message : 'Failed to start game' 
    };
  }
});

// Add OPTIONS handler for disconnect-from-game
router.options('/disconnect-from-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Update disconnect-from-game endpoint to support navigator.sendBeacon
router.post('/disconnect-from-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token from multiple sources including URL query for sendBeacon
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    // Check URL query parameters (for navigator.sendBeacon)
    const urlParams = ctx.request.url.searchParams;
    const queryToken = urlParams.get('auth_token');
    
    const tokenToUse = authToken || headerToken || queryToken;
    
    if (!tokenToUse) {
      console.log('No token provided for disconnect-from-game');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    // Extract userId with proper type conversion
    let userId: number;
    if (typeof tokenData.userId === 'number') {
      userId = tokenData.userId;
    } else if (typeof tokenData.userId === 'string') {
      userId = parseInt(tokenData.userId, 10);
      if (isNaN(userId)) {
        console.error('Invalid userId format in token:', tokenData.userId);
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid user ID format' };
        return;
      }
    } else {
      console.error('Token contains invalid userId type:', typeof tokenData.userId);
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing or invalid user ID in token' };
      return;
    }
    
    const username = tokenData.userName;
    
    if (!username) {
      console.error('Token missing userName');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing username in token' };
      return;
    }
    
    console.log(`User ${username} (ID: ${userId}) explicitly disconnecting from game`);
    
    // Now userId is guaranteed to be a proper number
    // Get active game for this user
    const userActiveGame = await getActiveGameForUser(userId);
    
    if (!userActiveGame) {
      console.log(`No active game found for user ${username}`);
      ctx.response.status = 200; // Still return success to avoid errors during navigation
      ctx.response.body = { success: true, message: 'No active game found' };
      return;
    }
    
    const gameId = userActiveGame.idGame;
    
    // Find and remove this user's connection
    const connectionIndex = connections.findIndex(conn => conn.username === username);
    if (connectionIndex !== -1) {
      console.log(`Removing connection for user ${username}`);
      connections.splice(connectionIndex, 1);
    } else {
      console.log(`No active connection found for user ${username}`);
    }
    
    // Check if any other user from this game is still connected
    const usersInGame = await getUsersInGame(gameId);
    const anyUserStillConnected = usersInGame.some(user => 
      connections.some(conn => conn.username === user.Username)
    );
    
    // If no users are connected, mark the game as finished
    if (!anyUserStillConnected) {
      console.log(`No players connected to game ${gameId}, marking as finished`);
      await markGameAsFinished(gameId);
    } else {
      // Otherwise, notify remaining users
      const connectedUsers = usersInGame
        .filter(user => connections.some(conn => conn.username === user.Username))
        .map(user => {
          let ppPath = '';
          if (user.Profile_picture) {
            const base64String = safelyConvertToBase64(user.Profile_picture);
            ppPath = base64String ? `data:image/png;base64,${base64String}` : '';
          }
          
          return {
            username: user.Username,
            pp_path: ppPath
          };
        });
      
      // Notify all remaining connected users
      notifyGameUsers(gameId, { type: 'connected_users', users: connectedUsers });
    }
    
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error('Error in disconnect-from-game endpoint:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// New endpoint to get all card resources
router.get("/api/cards", async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const cards = await cardService.getAllCardsWithMetadata();
    ctx.response.body = { cards };
  } catch (error) {
    console.error("Error loading card resources:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to load card resources" };
  }
});

interface TokenPayload {
  userName: string;
  userId: number;
  [key: string]: unknown;
}

router.get("/", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  try {
    // Extract auth token from request
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    const tokenToUse = authToken || headerToken;
    
    if (!tokenToUse) {
      ctx.throw(401, "Unauthorized: Missing authentication token");
      return;
    }
    
    // Verify token with proper type assertion
    const tokenData = await verify(tokenToUse, secretKey) as TokenPayload;
    const username = tokenData.userName;
    const userId = tokenData.userId;
    
    if (!username || userId === undefined) {
      ctx.throw(401, "Invalid token format: missing username or userId");
      return;
    }

    console.log(`WebSocket connection attempt by user: ${username} (ID: ${userId})`);
    
    // Check if the user is already connected
    const isConnected = connections.some((conn) => conn.username === username);
    if (isConnected) {
      ctx.throw(403, "User is already connected");
      return;
    }

    // Upgrade to WebSocket
    const ws = ctx.upgrade();
    
    // Initialize gameId variable explicitly
    let currentGameId: number | null = null;
    
    // Check if user has an active game
    try {
      const activeGame = await getActiveGameForUser(userId);
      if (activeGame) {
        currentGameId = activeGame.idGame;
        console.log(`User ${username} has active game: ${currentGameId}`);
      }
    } catch (error) {
      console.error(`Error getting active game for user ${userId}:`, error);
    }
    
    // Add connection to the list with correct types
    connections.push({ 
      ws, 
      username: username, 
      gameId: currentGameId, 
      userId: userId 
    });
    
    console.log(`+ WebSocket connected: ${username} to game ${currentGameId || 'none'} (total: ${connections.length})`);
    
    // On WebSocket open, send initial data
    // 1. Send card back image
    const cardBackImage = await cardService.getCardBackImage();
    ws.send(JSON.stringify({
      type: "card_back",
      image: cardBackImage
    }));
    
    // 2. Send connected users
    if (currentGameId) {
      sendConnectedUsers(currentGameId);
      
      // 3. Send current game state
      sendGameState(currentGameId, ws);

    const gameConnections = connections.filter(conn => conn.gameId === currentGameId);
    console.log(`Current connections in game ${currentGameId}: ${gameConnections.length}`);
    gameConnections.forEach(conn => {
      console.log(`- User: ${conn.username}, ID: ${conn.userId}`);
  });
    }

    // WebSocket message handler
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        
        // Verify auth token
        const authToken = data.auth_token;
        if (!is_authorized(authToken)) {
          console.log("Unauthorized WebSocket message");
          return;
        }
        
        // Handle messages
        switch (data.type) {
          case "join_game":
            handleJoinGame(data, userId, ws);
            break;
          
          case "player_action": {
            // First check if the cardId exists
            if (!data.action.cardId) {
              console.error("Missing cardId in player action");
              return;
            }
            
            // In war mode, playing a card might need special handling
            const gameState = await getGameState(data.gameId);
            if (gameState && gameState.inWar) {
              // Special war card handling
              await handleWarCardPlay(data.gameId, userId, data.action.cardId);
            } else {
              // Normal card play
              await handlePlayerAction(data, userId, username, ws);
            }
            break;
          }
          
          case "chat_message":
            handleChatMessage(data, userId, username);
            break;
          
          case "sync_request":
            handleSyncRequest(data, ws);
            break;
          
          case "connected_users":
            sendConnectedUsers(data.gameId);
            break;
          
          case "game_state_request":
            sendGameState(data.gameId, ws);
            break;

          case "update_game_state":
            handleGameStateUpdate(data, userId, ws);
            break;

          case "update_round":
          handleRoundUpdate(data, userId, ws);
          break;

          case "turn_change":
          handleTurnChange(data, userId, username, ws);
          break;
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        ws.send(JSON.stringify({
          type: "error",
          message: "Failed to process message"
        }));
      }
    };

    // WebSocket close handler
    ws.onclose = async () => {
      // Remove connection
      const index = connections.findIndex((conn) => conn.ws === ws);
      if (index !== -1) {
        const disconnectedUser = connections[index];
        connections.splice(index, 1);
        
        // Update connected users for this game
        if (disconnectedUser.gameId) {
          sendConnectedUsers(disconnectedUser.gameId);
        }
      }
      
      console.log(`- WebSocket disconnected (${connections.length} remaining)`);
    };

    // WebSocket error handler
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

  } catch (error) {
    // Add error handling here
    console.error("Error in WebSocket connection:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "WebSocket connection error" };
  }
});
// the cookie is tested in the middleware (the cookie is provided by the browser in a header)
router.get('/test_cookie', authorizationMiddleware, (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  ctx.response.body = { message: 'Token verified successfully', token_data: ctx.state.tokenData };
});

// Vérification des arguments (port)
if (Deno.args.length < 2) {
  console.log(
    `Usage: $ deno run --allow-net --allow-env backend/back_server.ts PORT ALLOW_ORIGIN [CERT_PATH KEY_PATH]`,
  );
  Deno.exit();
}
const PORT = parseInt(Deno.args[0]);
const ALLOW_ORIGIN = Deno.args[1];

const options: { port: number; hostname?: string; certFile?: string; keyFile?: string } = {
  port: PORT,
};

if (Deno.args.length >= 4) {
  options.certFile = Deno.args[2];
  options.keyFile = Deno.args[3];
  console.log(`SSL conf ready (use https)`);
}

// Add custom CORS middleware
app.use(async (ctx, next) => {
  try {
    // Log the incoming request
    console.log(`${ctx.request.method} ${ctx.request.url.pathname} - Origin: ${ctx.request.headers.get("origin")}`);
    
    // Add CORS headers manually
    const origin = ctx.request.headers.get("origin");
    if (origin === "http://localhost:8080" || origin === `http://${ALLOW_ORIGIN}`) {
      ctx.response.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      // Default fallback - you might want to restrict this in production
      ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
    }
    
    ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
    ctx.response.headers.set("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS");
    ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
    
    // Handle preflight requests
    if (ctx.request.method === "OPTIONS") {
      console.log("Handling OPTIONS preflight request");
      ctx.response.status = 204; // No content for OPTIONS
      return;
    }
    
    await next();
  } catch (error) {
    console.error("CORS middleware error:", error);
    throw error; // Re-throw to be caught by the global error handler
  }
});

// Configure CORS options
const corsOptions: CorsOptions = {
  origin: [`http://${ALLOW_ORIGIN}`, 'http://localhost:8080'],
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization", "Accept"]
};

// Apply the cors middleware
// @ts-ignore: The 'cors' library is compatible but TypeScript may not recognize its type definitions
app.use(cors(corsOptions));

// Add global error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Request error:", err);
    if (err instanceof Error && 'status' in err) {
      ctx.response.status = (err as { status?: number }).status || 500;
    } else {
      ctx.response.status = 500;
    }
    ctx.response.body = {
      error: err instanceof Error ? err.message : "Internal Server Error",
    };
  }
});

console.log(
  `Oak back server running on port ${options.port}, with CORS enabled for ${ALLOW_ORIGIN}`,
);
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen(options);