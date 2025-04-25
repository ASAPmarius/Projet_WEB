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

const secretKey = await crypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-512' },
  true,
  ['sign', 'verify'],
);

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

// Middleware to verify JWT token
const authorizationMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
  const cookie = ctx.request.headers.get('cookie');
  const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];

  if (!authToken) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Unauthorized: Missing token' };
    return;
  }

  try {
    // Verify the token
    const tokenData = await verify(authToken, secretKey);
    ctx.state.tokenData = tokenData; // Store data in ctx.state for use in other middlewares/routes
    await next();
  } catch {
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

// Database functions
async function createGame(gameType: string): Promise<number> {
  const result = await client.queryObject<{ idGame: number }>(
    'INSERT INTO "Game" ("GameType") VALUES ($1) RETURNING "idGame"',
    [gameType]
  );
  return result.rows[0].idGame;
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

// Create a new game or get existing one
async function getOrCreateGame(): Promise<number> {
  if (currentGameId === null) {
    currentGameId = await createGame('classic');
    
    // Get all card types (excluding the card back which is id 54)
    const result = await client.queryObject<{ idCardType: number }>(
      'SELECT "idCardType" FROM "Cards" WHERE "idCardType" < 53 ORDER BY "idCardType"'
    );
    
    const cardTypeIds = result.rows.map(row => row.idCardType);
    
    // Shuffle the card types using Fisher-Yates algorithm
    for (let i = cardTypeIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardTypeIds[i], cardTypeIds[j]] = [cardTypeIds[j], cardTypeIds[i]];
    }
    
    // Create active cards for this game
    for (const cardTypeId of cardTypeIds) {
      await createActiveCard(currentGameId, cardTypeId, 'in_deck');
    }
  }
  
  return currentGameId;
}

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

  // Get or create a game
  const gameId = await getOrCreateGame();
  
  // Add user to the game
  await addUserToGame(user.idUser, gameId);

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

router.get('/', authorizationMiddleware, async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  const username = ctx.state.tokenData.userName;
  const userId = ctx.state.tokenData.userId || 0; // Add fallback value

  // Check if the user is already connected
  const isConnected = connections.some((conn) => conn.username === username);
  if (isConnected) {
    ctx.throw(403, 'User is already connected');
    return;
  }

  const ws = ctx.upgrade();

  // Get the current game
  const gameId = await getOrCreateGame();
  
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
        }
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
      // Get the current game ID
      const gameId = await getOrCreateGame();
      
      // Find a card in the deck
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
        // Get all users in the current game
        const gameId = await getOrCreateGame();
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
        
        console.log('Sending connected users with card counts:', response);
        notifyAllUsers(response);
        return;
      }

      // Updated chat message handling in ws.onmessage
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
        
        // Store the message in the database with the user ID
        const gameId = await getOrCreateGame();
        
        try {
          // Explicitly pass the userId as a number to ensure it's not null
          const chatMessage = await recordChatMessage(gameId, userId, msg);
          console.log(`Chat message recorded with ID: ${chatMessage.idMessages}, userId: ${chatMessage.idUser}`);
          
          // Handle profile picture - either from DB or path
          let userProfilePicture = '';
          if (user.Profile_picture) {
            const base64String = safelyConvertToBase64(user.Profile_picture);
            userProfilePicture = base64String ? `data:image/png;base64,${base64String}` : '';
          }
          
          // Send the message to all connected users
          connections.forEach((client) => {
            client.ws.send(
              JSON.stringify({
                type: 'message',
                message: msg,
                owner: owner,
                user_pp_path: userProfilePicture,
                username: client.username,
                userId: userId  // Add userId to the message object
              }),
            );
          });
        } catch (error) {
          console.error('Error recording chat message:', error);
        }
        
        return;
      }

    if (data.type === 'connected_users') {
      // Get all users in the current game
      const gameId = await getOrCreateGame();
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
      
      console.log('Sending connected users:', connectedUsers); // Debug log
      notifyAllUsers({ type: 'connected_users', users: connectedUsers });
      return;
    }

    if (data.type === 'card_request') {
      // Get the card back image instead of the actual card
      const gameId = await getOrCreateGame();
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
            }
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
          }
        }));
      }
      return;
    }

    if (data.type === 'hand_request' && userId) {
      // Get the user's hand from the database
      const gameId = await getOrCreateGame();
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
    const index = connections.findIndex((conn) => conn.ws === ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    
    // Update the connected users list
    const gameId = await getOrCreateGame();
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
    
    notifyAllUsers({ type: 'connected_users', users: connectedUsers });
    console.log(`- websocket disconnected (${connections.length})`);
    
    // Check if the game is finished (no more players)
    if (connections.length === 0 && currentGameId !== null) {
      // Clean up the finished game's ActiveCards
      await cleanupFinishedGame(currentGameId);
      currentGameId = null; // Reset for a new game
    } else {
      // Check for other finished games that might need cleanup
      await checkAndCleanupFinishedGames();
    }
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