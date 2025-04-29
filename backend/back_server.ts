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

// Define interfaces for your database models
interface User {
  idUser: number;
  Username: string;
  Password: string;
  Profile_picture: Uint8Array | null;
  isAdmin: boolean;
  Bio?: string;         // New optional field
  Favorite_song?: string; // New optional field
}

interface Card {
  idCardType: number;
  Picture: Uint8Array; // BYTEA data stored as binary
}

interface ActiveCard {
  idCard: number;
  idGame: number;
  idUserHoldingIt: number | null;
  CardState: string;
  cardType: number;
}

interface ChatMessage {
  idMessages: number;
  idGame: number;
  idUser: number;       // New field matching the updated database
  TextContent: string;
  Timestamp: Date;
}

interface Game {
  idGame: number;
  DateCreated: Date;
  GameType: string;
  GameStatus?: string; // New field: 'active', 'finished', etc.
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

// Connection related variables
const tokens: { [key: string]: string } = {};
const connections: { 
  ws: WebSocket; 
  username: string; 
  hand: number[]; 
  handCards?: { idCard: number; picture: string; cardType: number }[] 
}[] = [];

function removeTokenByUser(user: string) {
  for (const token in tokens) {
    if (tokens[token] === user) {
      delete tokens[token];
      break;
    }
  }
}

// deno-lint-ignore no-explicit-any
function notifyAllUsers(json: any) {
  connections.forEach((client) => {
    client.ws.send(JSON.stringify(json));
  });
}

// Use this function when you explicitly want to create a new game
async function createNewGame(gameType: string = 'classic'): Promise<number> {
  // Create a new game with 'active' status
  const result = await client.queryObject<{ idGame: number }>(
    'INSERT INTO "Game" ("GameType", "GameStatus") VALUES ($1, $2) RETURNING "idGame"',
    [gameType, 'active']
  );
  
  const gameId = result.rows[0].idGame;
  
  // Get all card types (excluding the card back which is id 54)
  const cardTypesResult = await client.queryObject<{ idCardType: number }>(
    'SELECT "idCardType" FROM "Cards" WHERE "idCardType" < 53 ORDER BY "idCardType"'
  );
  
  const cardTypeIds = cardTypesResult.rows.map(row => row.idCardType);
  
  // Shuffle the card types using Fisher-Yates algorithm
  for (let i = cardTypeIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardTypeIds[i], cardTypeIds[j]] = [cardTypeIds[j], cardTypeIds[i]];
  }
  
  // Create active cards for this game
  for (const cardTypeId of cardTypeIds) {
    await createActiveCard(gameId, cardTypeId, 'in_deck');
  }
  
  return gameId;
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
    await client.queryObject(
      'UPDATE "Game" SET "GameStatus" = \'finished\' WHERE "idGame" = $1',
      [gameId]
    );
    
    // Once marked as finished, we can clean up the ActiveCards
    await cleanupFinishedGame(gameId);
    
    console.log(`Game ${gameId} marked as finished`);
  } catch (error) {
    console.error(`Error marking game ${gameId} as finished:`, error);
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

async function getAllCardTypes(): Promise<Card[]> {
  const result = await client.queryObject<Card>('SELECT * FROM "Cards"');
  return result.rows;
}

// Helper function to initialize a game deck
async function initializeGameDeck(gameId: number): Promise<void> {
  try {
    // Get all card types (excluding the card back which is id 54)
    const cardTypesResult = await client.queryObject<{ idCardType: number }>(
      'SELECT "idCardType" FROM "Cards" WHERE "idCardType" < 53 ORDER BY "idCardType"'
    );
    
    const cardTypeIds = cardTypesResult.rows.map(row => row.idCardType);
    
    // Shuffle the card types using Fisher-Yates algorithm
    for (let i = cardTypeIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardTypeIds[i], cardTypeIds[j]] = [cardTypeIds[j], cardTypeIds[i]];
    }
    
    // Create active cards for this game
    for (const cardTypeId of cardTypeIds) {
      await createActiveCard(gameId, cardTypeId, 'in_deck');
    }
    
    console.log(`Initialized deck for game ${gameId} with ${cardTypeIds.length} cards`);
  } catch (error) {
    console.error(`Error initializing game deck for game ${gameId}:`, error);
    throw error;
  }
}

async function createActiveCard(gameId: number, cardTypeId: number, state: string): Promise<ActiveCard> {
  // Check if the card type exists
  const cardTypeCheck = await client.queryObject<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Cards" WHERE "idCardType" = $1',
    [cardTypeId]
  );
  
  if (cardTypeCheck.rows[0].count === 0) {
    throw new Error(`Card type ${cardTypeId} does not exist`);
  }
  
  const result = await client.queryObject<ActiveCard>(
    'INSERT INTO "ActiveCards" ("idGame", "CardState", "cardType") VALUES ($1, $2, $3) RETURNING *',
    [gameId, state, cardTypeId]
  );
  
  return result.rows[0];
}

async function updateActiveCardState(cardId: number, state: string, userId: number | null): Promise<void> {
  await client.queryObject(
    'UPDATE "ActiveCards" SET "CardState" = $1, "idUserHoldingIt" = $2 WHERE "idCard" = $3',
    [state, userId, cardId]
  );
}

async function getActiveCardsInDeck(gameId: number): Promise<(ActiveCard & { picture_data: Uint8Array })[]> {
  const result = await client.queryObject<ActiveCard & { picture_data: Uint8Array }>(
    'SELECT ac.*, c."Picture" as picture_data FROM "ActiveCards" ac ' +
    'JOIN "Cards" c ON ac."cardType" = c."idCardType" ' +
    'WHERE ac."idGame" = $1 AND ac."CardState" = \'in_deck\'',
    [gameId]
  );
  return result.rows;
}

async function getActiveCardsInHand(gameId: number, userId: number): Promise<(ActiveCard & { picture_data: Uint8Array })[]> {
  const result = await client.queryObject<ActiveCard & { picture_data: Uint8Array }>(
    'SELECT ac.*, c."Picture" as picture_data FROM "ActiveCards" ac ' +
    'JOIN "Cards" c ON ac."cardType" = c."idCardType" ' +
    'WHERE ac."idGame" = $1 AND ac."idUserHoldingIt" = $2 AND ac."CardState" = \'in_hand\'',
    [gameId, userId]
  );
  return result.rows;
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

// Function to get card back image (id 54)
async function getCardBackImage(): Promise<Uint8Array | null> {
  const result = await client.queryObject<{ Picture: Uint8Array }>(
    'SELECT "Picture" FROM "Cards" WHERE "idCardType" = 54'
  );
  return result.rows.length > 0 ? result.rows[0].Picture : null;
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

router.post('/create-game', authorizationMiddleware, async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const userId = ctx.state.tokenData.userId;
  
  if (!userId) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Missing user ID' };
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
    
    // Create a new game (this already initializes the deck)
    const gameId = await createNewGame('classic');
    
    // Add user to the game
    await addUserToGame(userId, gameId);
    
    // Set current game ID
    currentGameId = gameId;
    
    // Get the game to return it
    const game = await client.queryObject<Game>(
      'SELECT * FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { game: game.rows[0] };
  } catch (error) {
    console.error('Error creating game:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to create game' };
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
    
    // Get card counts for each player
    const playersWithCardCounts = await Promise.all(players.map(async (player) => {
      // Get cards for this player
      const playerCards = await getActiveCardsInHand(activeGame.idGame, player.idUser);
      
      return { 
        id: player.idUser,
        username: player.Username,
        cardCount: playerCards.length
      };
    }));
    
    // Get number of cards left in deck
    const cardsInDeck = await getActiveCardsInDeck(activeGame.idGame);
    
    ctx.response.status = 200;
    ctx.response.body = { 
      game: {
        ...activeGame,
        players: playersWithCardCounts,
        cardsInDeck: cardsInDeck.length
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
// In back_server.ts, replace the WebSocket upgrade handler

router.get('/', authorizationMiddleware, async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  const username = ctx.state.tokenData.userName;
  const userId = ctx.state.tokenData.userId || 0;

  // Check if the user is already connected
  const isConnected = connections.some((conn) => conn.username === username);
  if (isConnected) {
    ctx.throw(403, 'User is already connected');
    return;
  }

  // Check if user has an active game before establishing WebSocket
  const activeGame = await getActiveGameForUser(userId);
  if (!activeGame) {
    ctx.response.status = 404;
    ctx.response.body = { error: 'No active game found' };
    return;
  }

  const ws = ctx.upgrade();

  // Use the active game ID instead of creating a new one
  const gameId = activeGame.idGame;
  
  // Get user's hand from the database
  const userCards = await getActiveCardsInHand(gameId, userId);
  const hand = userCards.map(card => card.idCard);

  // Add connection to the list
  connections.push({ ws, username, hand });
  console.log(`+ websocket connected (${connections.length})`);

  // Send initial card back when user connects
  const cardsInDeck = await getActiveCardsInDeck(gameId);
  if (cardsInDeck.length > 0) {
    const cardBackImage = await getCardBackImage();
    try {
      const base64String = safelyConvertToBase64(cardBackImage);
      ws.send(JSON.stringify({ 
        type: 'card_change', 
        card: {
          idCard: cardsInDeck[0].idCard,
          picture: base64String ? `data:image/png;base64,${base64String}` : '',
          cardType: 54
        },
        pileCount: cardsInDeck.length
      }));
    } catch (error) {
      console.error('Error sending initial card back:', error);
    }
  }

  // Send connected users list to the new connection
  const usersInGame = await getUsersInGame(gameId);
  const connectedUsers = usersInGame.map(user => {
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
  
  // Send to the new user
  ws.send(JSON.stringify({ type: 'connected_users', users: connectedUsers }));
  
  // Notify all other users about the new connection
  notifyAllUsers({ type: 'connected_users', users: connectedUsers });

  ws.onerror = (_error) => {
    const index = connections.findIndex((conn) => conn.ws === ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    console.log(`- websocket error`);
  };

// In the ws.onmessage handler, we need to modify several places to use game ID from the connection
// Here's a partial example showing key changes needed:

ws.onmessage = async (event) => {
  const message = event.data;
  const data = JSON.parse(message);

  // Get user information
  const owner = tokens[data.auth_token];
  if (!owner) {
    console.log('Invalid auth token');
    return;
  }
  
  const user = await getUserByUsername(owner);
  if (!user) {
    console.log('User not found');
    return;
  }
  
  const userId = user.idUser;
  
  // Get the user's current active game
  const activeGame = await getActiveGameForUser(userId);
  if (!activeGame) {
    console.log('No active game found for user');
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No active game found. Please join or create a game first.'
    }));
    return;
  }

  const gameId = activeGame.idGame;
  
  // Handle player_hand_update
  if (data.type === 'player_hand_update' && owner === data.username) {
    // Broadcast the card count update to all connected users
    notifyAllUsers({
      type: 'player_hand_update',
      username: data.username,
      cardCount: data.cardCount
    });
    return;
  }

  // Handle add_card_to_hand - add counting deck cards
  if (data.type === 'add_card_to_hand' && userId) {
    // Find a card in the deck - use the specific game ID, not a global one
    const cardsInDeck = await getActiveCardsInDeck(gameId);
    
    if (cardsInDeck.length > 0) {
      const card = cardsInDeck[0];
      
      // Update the card state
      await updateActiveCardState(card.idCard, 'in_hand', userId);
      
      // Update the player's hand in memory
      const connectionIndex = connections.findIndex(conn => conn.username === owner);
      if (connectionIndex !== -1) {
        connections[connectionIndex].hand.push(card.idCard);
      }
      
      // Send the updated hand back to the client
      const updatedCards = await getActiveCardsInHand(gameId, userId);
      
      // Convert binary data to base64 strings for JSON safely
      try {
        const handCards = updatedCards.map(card => {
          // Safely convert binary data to base64
          const picture_data = card.picture_data;
          let base64String = '';
          
          if (picture_data) {
            base64String = safelyConvertToBase64(picture_data);
          }
          
          return {
            idCard: card.idCard,
            picture: base64String ? `data:image/png;base64,${base64String}` : '',
            cardType: card.cardType
          };
        });
        
        // Update the connection's handCards
        if (connectionIndex !== -1) {
          connections[connectionIndex].handCards = handCards;
        }
        
        ws.send(JSON.stringify({ 
          type: 'player_hand', 
          hand: handCards
        }));
        
        // Broadcast the card count update to all connected users
        notifyAllUsers({
          type: 'player_hand_update',
          username: owner,
          cardCount: updatedCards.length
        });
      } catch (error) {
        console.error('Error converting hand images to base64:', error);
      }
      
      // Notify all users about the card change (show card back)
      const remainingCardsInDeck = await getActiveCardsInDeck(gameId);
      if (remainingCardsInDeck.length > 0) {
        // Get the card back image instead of the actual card
        const cardBackImage = await getCardBackImage();
        
        try {
          // Convert card back image to base64
          const base64String = safelyConvertToBase64(cardBackImage);
          
          notifyAllUsers({ 
            type: 'card_change', 
            card: {
              idCard: remainingCardsInDeck[0].idCard,
              picture: base64String ? `data:image/png;base64,${base64String}` : '',
              cardType: 54 // Indicate it's a card back
            },
            pileCount: remainingCardsInDeck.length // Add the deck count
          });
        } catch (error) {
          console.error('Error converting card back image to base64:', error);
        }
      } else {
        // Notify that the deck is empty
        notifyAllUsers({ 
          type: 'card_change', 
          card: {
            idCard: null,
            picture: '',
            cardType: null
          },
          pileCount: 0
        });
      }
    } else {
      console.log('No cards left in the pile');
    }
    return;
  }

  // Update the connected_users handler to include card counts
  if (data.type === 'connected_users') {
    const usersInGame = await getUsersInGame(gameId);
    
    const connectedUsers = await Promise.all(usersInGame.map(async (user) => {
      // Get profile picture
      let ppPath = '';
      if (user.Profile_picture) {
        const base64String = safelyConvertToBase64(user.Profile_picture);
        ppPath = base64String ? `data:image/png;base64,${base64String}` : '';
      }
      
      // Get card count for this user from active connection or database
      const connection = connections.find(conn => conn.username === user.Username);
      let cardCount = 0;
      
      if (connection) {
        // If user is connected, use hand length from connection
        cardCount = connection.hand.length;
      } else {
        // Otherwise, query database for cards in hand
        const userCards = await getActiveCardsInHand(gameId, user.idUser);
        cardCount = userCards.length;
      }
      
      return {
        username: user.Username,
        pp_path: ppPath,
        cardCount: cardCount
      };
    }));
    
    // Add current user information to the response
    const response = { 
      type: 'connected_users', 
      users: connectedUsers,
      username: owner // Add current username for client identification
    };
    
    notifyAllUsers(response);
    return;
  }

  // Updated chat message handling
  if ('message' in data) {
    const msg = data.message;
    if (msg.length == 0) {
      return;
    }
    
    // Check that we have a valid userId
    if (!userId) {
      console.error('Cannot send message: Missing userId for user', owner);
      return;
    }
    
    try {
      // Record the chat message in the database with the user ID
      const chatMessage = await recordChatMessage(gameId, userId, msg);
      console.log(`Chat message recorded with ID: ${chatMessage.idMessages}, userId: ${chatMessage.idUser}`);
      
      // Handle profile picture - either from DB or path
      let userProfilePicture = '';
      if (user.Profile_picture) {
        const base64String = safelyConvertToBase64(user.Profile_picture);
        userProfilePicture = base64String ? `data:image/png;base64,${base64String}` : '';
      }
      
      // Send the message to all connected users in the same game
      connections.forEach((client) => {
        client.ws.send(
          JSON.stringify({
            type: 'message',
            message: msg,
            owner: owner,
            user_pp_path: userProfilePicture,
            username: client.username,
            userId: userId
          }),
        );
      });
    } catch (error) {
      console.error('Error recording chat message:', error);
    }
    
    return;
  }

  // Card request handler
  if (data.type === 'card_request') {
    const cardsInDeck = await getActiveCardsInDeck(gameId);
    
    if (cardsInDeck.length > 0) {
      const card = cardsInDeck[0];
      // Get the card back image (id 54)
      const cardBackImage = await getCardBackImage();
      
      try {
        // Convert card back image to base64
        const base64String = safelyConvertToBase64(cardBackImage);
        
        ws.send(JSON.stringify({ 
          type: 'card_change', 
          card: {
            idCard: card.idCard,
            picture: base64String ? `data:image/png;base64,${base64String}` : '',
            cardType: 54 // Indicate it's a card back
          },
          pileCount: cardsInDeck.length
        }));
      } catch (error) {
        console.error('Error converting card back image to base64:', error);
      }
    } else {
      // If no cards left, show empty pile or some indication
      ws.send(JSON.stringify({ 
        type: 'card_change', 
        card: {
          idCard: null,
          picture: '',
          cardType: null
        },
        pileCount: 0
      }));
    }
    return;
  }

  // Hand request handler
  if (data.type === 'hand_request' && userId) {
    // Get the user's hand from the database
    const userCards = await getActiveCardsInHand(gameId, userId);
    
    // Convert binary data to base64 strings for JSON safely
    try {
      ws.send(JSON.stringify({ 
        type: 'player_hand', 
        hand: userCards.map(card => {
          // Safely convert binary data to base64
          const picture_data = card.picture_data;
          let base64String = '';
          
          if (picture_data) {
            base64String = safelyConvertToBase64(picture_data);
          }
          
          return {
            idCard: card.idCard,
            picture: base64String ? `data:image/png;base64,${base64String}` : '',
            cardType: card.cardType
          };
        })
      }));
    } catch (error) {
      console.error('Error converting hand images to base64:', error);
    }
    return;
  }
};

ws.onclose = async () => {
  // Find the index of the closed connection
  const index = connections.findIndex((conn) => conn.ws === ws);
  
  // Get the username of the disconnected user before removing the connection
  const disconnectedUsername = index !== -1 ? connections[index].username : null;
  
  // Remove the connection from the list
  if (index !== -1) {
    connections.splice(index, 1);
  }
  
  // If we have the username of the disconnected user
  if (disconnectedUsername) {
    try {
      // Get the user's ID from their username
      const disconnectedUser = await getUserByUsername(disconnectedUsername);
      
      if (disconnectedUser) {
        // Get the active game for this user
        const userActiveGame = await getActiveGameForUser(disconnectedUser.idUser);
        
        if (userActiveGame) {
          const gameId = userActiveGame.idGame;
          
          // Update the connected users list for this game
          const usersInGame = await getUsersInGame(gameId);
          
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
          
          // Send the updated user list to all remaining connected users
          notifyAllUsers({ type: 'connected_users', users: connectedUsers });
          
          // Check if there are any active connections for this game
          const connectionsForThisGame = connections.filter(conn => {
            return usersInGame.some(user => user.Username === conn.username);
          });
          
          // If no connections left for this game, clean it up
          if (connectionsForThisGame.length === 0) {
            console.log(`No players connected to game ${gameId}, cleaning up`);
            await markGameAsFinished(gameId);
            
            // If this was the current game, reset currentGameId
            if (currentGameId === gameId) {
              currentGameId = null;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error updating user list after disconnect:', error);
    }
  }
  
  console.log(`- websocket disconnected (${connections.length} remaining)`);
};
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