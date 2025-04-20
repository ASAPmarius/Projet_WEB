import { loadSync } from 'dotenv';
console.log('About to load .env file');
const env = loadSync();
console.log('Loaded .env file:', env);

for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value); // 👈 this line is crucial
}

import { Application, Context, Router } from 'oak';
import { cors, type CorsOptions } from 'cors';
import * as bcrypt from 'bcrypt';
import { create, verify } from 'djwt';
import { Client } from 'postgres';

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

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

const router = new Router();
const app = new Application();

addEventListener('unload', async () => {
  console.log('🛑 Shutting down — disconnecting Postgres');
  await client.end();
});

// Update paths for profile pictures to match new structure
const PROFILE_PICTURES_PATH = 'frontend/profile_pictures/';

const secretKey = await crypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-512' },
  true,
  ['sign', 'verify'],
);

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
  // const saltRounds = 10;
  // const salt = await bcrypt.genSalt(saltRounds);  // Generate the salt manually
  return await bcrypt.hash(password); // Pass the salt to the hash function
}

// Connection related variables
const tokens: { [key: string]: string } = {};
const connections: { ws: WebSocket; username: string; hand: string[] }[] = [];

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

let next_user_id = 2;

// Update profile picture paths to reflect new structure
const users = [
  {
    'id': '0',
    'username': 'marius',
    'password_hash': await get_hash('goat'),
    'pp_path': 'profile_pictures/id0.jpg',
  },
  {
    'id': '1',
    'username': 'malou',
    'password_hash': await get_hash('ponyo'),
    'pp_path': 'profile_pictures/id1.jpg',
  },
];

type CardKey =
  | 'Ace, clubs'
  | '2, clubs'
  | '3, clubs'
  | '4, clubs'
  | '5, clubs'
  | '6, clubs'
  | '7, clubs'
  | '8, clubs'
  | '9, clubs'
  | '10, clubs'
  | 'Jack, clubs'
  | 'Queen, clubs'
  | 'King, clubs'
  | 'Ace, diamonds'
  | '2, diamonds'
  | '3, diamonds'
  | '4, diamonds'
  | '5, diamonds'
  | '6, diamonds'
  | '7, diamonds'
  | '8, diamonds'
  | '9, diamonds'
  | '10, diamonds'
  | 'Jack, diamonds'
  | 'Queen, diamonds'
  | 'King, diamonds'
  | 'Ace, hearts'
  | '2, hearts'
  | '3, hearts'
  | '4, hearts'
  | '5, hearts'
  | '6, hearts'
  | '7, hearts'
  | '8, hearts'
  | '9, hearts'
  | '10, hearts'
  | 'Jack, hearts'
  | 'Queen, hearts'
  | 'King, hearts'
  | 'Ace, spades'
  | '2, spades'
  | '3, spades'
  | '4, spades'
  | '5, spades'
  | '6, spades'
  | '7, spades'
  | '8, spades'
  | '9, spades'
  | '10, spades'
  | 'Jack, spades'
  | 'Queen, spades'
  | 'King, spades';

const cards: Record<CardKey, { name: string; state: string }> = {
  'Ace, clubs': { name: 'Ace, clubs', state: 'pile' },
  '2, clubs': { name: '2, clubs', state: 'pile' },
  '3, clubs': { name: '3, clubs', state: 'pile' },
  '4, clubs': { name: '4, clubs', state: 'pile' },
  '5, clubs': { name: '5, clubs', state: 'pile' },
  '6, clubs': { name: '6, clubs', state: 'pile' },
  '7, clubs': { name: '7, clubs', state: 'pile' },
  '8, clubs': { name: '8, clubs', state: 'pile' },
  '9, clubs': { name: '9, clubs', state: 'pile' },
  '10, clubs': { name: '10, clubs', state: 'pile' },
  'Jack, clubs': { name: 'Jack, clubs', state: 'pile' },
  'Queen, clubs': { name: 'Queen, clubs', state: 'pile' },
  'King, clubs': { name: 'King, clubs', state: 'pile' },
  'Ace, diamonds': { name: 'Ace, diamonds', state: 'pile' },
  '2, diamonds': { name: '2, diamonds', state: 'pile' },
  '3, diamonds': { name: '3, diamonds', state: 'pile' },
  '4, diamonds': { name: '4, diamonds', state: 'pile' },
  '5, diamonds': { name: '5, diamonds', state: 'pile' },
  '6, diamonds': { name: '6, diamonds', state: 'pile' },
  '7, diamonds': { name: '7, diamonds', state: 'pile' },
  '8, diamonds': { name: '8, diamonds', state: 'pile' },
  '9, diamonds': { name: '9, diamonds', state: 'pile' },
  '10, diamonds': { name: '10, diamonds', state: 'pile' },
  'Jack, diamonds': { name: 'Jack, diamonds', state: 'pile' },
  'Queen, diamonds': { name: 'Queen, diamonds', state: 'pile' },
  'King, diamonds': { name: 'King, diamonds', state: 'pile' },
  'Ace, hearts': { name: 'Ace, hearts', state: 'pile' },
  '2, hearts': { name: '2, hearts', state: 'pile' },
  '3, hearts': { name: '3, hearts', state: 'pile' },
  '4, hearts': { name: '4, hearts', state: 'pile' },
  '5, hearts': { name: '5, hearts', state: 'pile' },
  '6, hearts': { name: '6, hearts', state: 'pile' },
  '7, hearts': { name: '7, hearts', state: 'pile' },
  '8, hearts': { name: '8, hearts', state: 'pile' },
  '9, hearts': { name: '9, hearts', state: 'pile' },
  '10, hearts': { name: '10, hearts', state: 'pile' },
  'Jack, hearts': { name: 'Jack, hearts', state: 'pile' },
  'Queen, hearts': { name: 'Queen, hearts', state: 'pile' },
  'King, hearts': { name: 'King, hearts', state: 'pile' },
  'Ace, spades': { name: 'Ace, spades', state: 'pile' },
  '2, spades': { name: '2, spades', state: 'pile' },
  '3, spades': { name: '3, spades', state: 'pile' },
  '4, spades': { name: '4, spades', state: 'pile' },
  '5, spades': { name: '5, spades', state: 'pile' },
  '6, spades': { name: '6, spades', state: 'pile' },
  '7, spades': { name: '7, spades', state: 'pile' },
  '8, spades': { name: '8, spades', state: 'pile' },
  '9, spades': { name: '9, spades', state: 'pile' },
  '10, spades': { name: '10, spades', state: 'pile' },
  'Jack, spades': { name: 'Jack, spades', state: 'pile' },
  'Queen, spades': { name: 'Queen, spades', state: 'pile' },
  'King, spades': { name: 'King, spades', state: 'pile' },
};

let currentCardIndex = 0;
let shuffledCardKeys: CardKey[] = [];

function shuffleCards(): void {
  const cardKeys = Object.keys(cards) as CardKey[]; // Get all keys from the cards object
  for (let i = cardKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // Generate a random index
    [cardKeys[i], cardKeys[j]] = [cardKeys[j], cardKeys[i]]; // Swap keys
  }

  // Update the state of all cards to "pile" to reset the game
  cardKeys.forEach((key) => {
    cards[key].state = 'pile';
  });

  // Store the shuffled keys in a global variable for use in the game
  shuffledCardKeys = cardKeys;
}

router.post('/login', checkIfAlreadyConnected, async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body;
  const user = users.find((u) => u.username === username);

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    return;
  }

  const result = await bcrypt.verify(password, user.password_hash);
  if (!result) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    console.log('Invalid username or password');
    return;
  }
  const token = await create({ alg: 'HS512', typ: 'JWT' }, { userName: user.username }, secretKey);

  removeTokenByUser(username);
  tokens[token] = username;

  ctx.response.status = 200;
  ctx.response.headers.set(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`,
  );
  ctx.response.body = { status: 'success', auth_token: token };
});

router.post('/create_account', async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password, profilePicture } = body;

  const existingUser = users.find((u) => u.username === username);
  if (existingUser) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Username already exists' };
    return;
  }

  const password_hash = await get_hash(password);
  const newUser = { id: next_user_id.toString(), username, password_hash, pp_path: profilePicture };
  users.push(newUser);
  next_user_id++;

  ctx.response.status = 201;
  ctx.response.body = { status: 'success', user: newUser };
});

// route to get an HttpOnly token (can't be read by javascript on the browser)
router.get('/get_cookie', async (ctx) => {
  try {
    // Generate JWT token
    const token = await create({ alg: 'HS512', typ: 'JWT' }, { userName: 'dummy' }, secretKey); // Adjust algorithm and type as needed

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

router.get('/', authorizationMiddleware, (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  const username = ctx.state.tokenData.userName;

  // Check if the user is already connected
  const isConnected = connections.some((conn) => conn.username === username);
  if (isConnected) {
    ctx.throw(403, 'User is already connected');
    return;
  }

  const ws = ctx.upgrade();

  // Shuffle the cards at the start of the game
  shuffleCards();
  console.log('Cards shuffled', cards);

  const handSize = 5; // Number of cards in a hand
  const hand: string[] = [];
  let pileIndex = 0; // Start from the first card in the shuffled pile

  while (hand.length < handSize && pileIndex < shuffledCardKeys.length) {
    const cardKey = shuffledCardKeys[pileIndex];
    const card = cards[cardKey];

    if (card.state === 'pile') {
      card.state = 'hand'; // Update the card's state to "hand"
      hand.push(card.name); // Add the card to the player's hand
    }

    pileIndex++; // Move to the next card in the shuffled pile
  }

  connections.push({ ws, username, hand });
  console.log(`+ websocket connected (${connections.length})`);

  ws.onerror = (_error) => {
    const index = connections.findIndex((conn) => conn.ws === ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    console.log(`- websocket error`);
  };

  ws.onmessage = (event) => {
    const message = event.data;
    const data = JSON.parse(message);

    const owner = tokens[data.auth_token];
    const user = users.find((u) => u.username === owner);
    const user_pp_path = user?.pp_path;

    if (data.type === 'add_card_to_hand') {
      // Find the first card in the pile
      const cardKey = shuffledCardKeys.find((key) => cards[key].state === 'pile');
      if (cardKey) {
        const card = cards[cardKey];
        card.state = 'hand'; // Update the card's state to "hand"
        hand.push(card.name); // Add the card to the player's hand

        // Send the updated hand back to the client
        ws.send(JSON.stringify({ type: 'player_hand', hand: hand }));
      } else {
        console.log('No cards left in the pile');
      }
      do {
        currentCardIndex = (currentCardIndex + 1) % shuffledCardKeys.length;
        const cardKey = shuffledCardKeys[currentCardIndex];
        if (cards[cardKey].state === 'pile') {
          notifyAllUsers({ type: 'card_change', card: cards[cardKey] });
          break;
        }
      } while (true);
      return;
    }

    if ('message' in data) {
      const msg = data.message;
      if (msg.length == 0) {
        return;
      }
      connections.forEach((client) => {
        client.ws.send(
          JSON.stringify({
            type: 'message',
            message: msg,
            owner: owner,
            user_pp_path: user_pp_path,
            username: client.username,
          }),
        );
      });
      return;
    }

    if (data.type === 'connected_users') {
      const connectedUsers = connections.map((conn) => {
        const user = users.find((u) => u.username === conn.username);
        return user
          ? { username: user.username, pp_path: user.pp_path }
          : { username: conn.username, pp_path: '' };
      });
      notifyAllUsers({ type: 'connected_users', users: connectedUsers });
      return;
    }

    if (data.type === 'card_request') {
      const cardKey = Object.keys(cards)[currentCardIndex] as CardKey;
      ws.send(JSON.stringify({ type: 'card_change', card: cards[cardKey] }));
      return;
    }

    if (data.type === 'hand_request') {
      const hand = connections.find((conn) => conn.ws === ws)?.hand;
      ws.send(JSON.stringify({ type: 'player_hand', hand }));
      return;
    }
  };

  ws.onclose = () => {
    const index = connections.findIndex((conn) => conn.ws === ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    const connectedUsers = connections.map((conn) => {
      const user = users.find((u) => u.username === conn.username);
      return user
        ? { username: user.username, pp_path: user.pp_path }
        : { username: conn.username, pp_path: '' };
    });
    notifyAllUsers({ type: 'connected_users', users: connectedUsers });
    console.log(`- websocket disconnected (${connections.length})`);
  };
});

// the cookie is tested in the middleware (the cookie is provided by the browser in a header)
router.get('/test_cookie', authorizationMiddleware, (ctx) => {
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

// ✅ Activation du CORS avec plusieurs origines possibles
// app.use(
//   oakCors({
//     origin: [`http://${ALLOW_ORIGIN}`], // Ajoute les URLs nécessaires
//     credentials: true, // Autorise les cookies et authentifications
//   })
// );

const corsOptions: CorsOptions = {
  origin: `http://${ALLOW_ORIGIN}`,
  credentials: true,
};

// @ts-ignore: The 'cors' library is compatible but TypeScript may not recognize its type definitions
app.use(cors(corsOptions));

console.log(
  `Oak back server running on port ${options.port}, with CORS enabled for ${ALLOW_ORIGIN}`,
);
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen(options);
3000;
