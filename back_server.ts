import { Application, Context, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { create, verify } from "https://deno.land/x/djwt/mod.ts";


const router = new Router();
const app = new Application();

const secretKey = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-512" },
  true,
  ["sign", "verify"]
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
      console.log("verify token failed");
      return false;
    }
  }
  console.log("Unknown token");
  return false;
};

// Middleware to verify JWT token
const authorizationMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
  const cookie = ctx.request.headers.get("cookie");
  const authToken = cookie?.split("; ").find(row => row.startsWith("auth_token="))?.split('=')[1];

  if (!authToken) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Missing token" };
    return;
  }

  try {
    // Verify the token
    const tokenData = await verify(authToken, secretKey);
    ctx.state.tokenData = tokenData; // Store data in ctx.state for use in other middlewares/routes
    await next();
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Invalid token" };
  }
};

// Middleware to check if the user is already connected
const checkIfAlreadyConnected = async (ctx: Context, next: () => Promise<unknown>) => {
  const body = await ctx.request.body.json();
  const { username } = body;

  const isConnected = connections.some(conn => conn.username === username);

  if (isConnected) {
    ctx.response.status = 403;
    ctx.response.body = { error: "User is already connected" };
    return;
  }

  await next();
};

async function get_hash(password: string): Promise<string> {
  const saltRounds = 10;
  const salt = await bcrypt.genSalt(saltRounds);  // Generate the salt manually
  return await bcrypt.hash(password, salt);  // Pass the salt to the hash function
}

// Connection related variables
const tokens: { [key: string]: string } = {};
const connections: { ws: WebSocket, username: string }[] = [];

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

const users = [
  {"id" : '0', 'username': 'marius', 'password_hash': await get_hash("goat"), "pp_path": "profile_pictures/id0.jpg"},
  {"id" : '1', 'username': 'malou', 'password_hash': await get_hash("ponyo"), "pp_path": "profile_pictures/id1.jpg"}
]

router.post("/login", checkIfAlreadyConnected, async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password } = body;
  const user = users.find((u) => u.username === username);

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid username or password" };
    return;
  }

  const result = await bcrypt.compare(password, user.password_hash);
  if (!result) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid username or password" };
    console.log("Invalid username or password")
    return;
  }
  const token = await create({ alg: "HS512", typ: "JWT" }, { userName: user.username }, secretKey);

  removeTokenByUser(username);
  tokens[token] = username;

  ctx.response.status = 200;
  ctx.response.headers.set("Set-Cookie", `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`);
  ctx.response.body = { status: "success", auth_token: token};
});

router.post("/create_account", async (ctx) => {
  const body = await ctx.request.body.json();
  const { username, password, profilePicture } = body;

  const existingUser = users.find((u) => u.username === username);
  if (existingUser) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Username already exists" };
    return;
  }

  const password_hash = await get_hash(password);
  const newUser = { id: next_user_id.toString(), username, password_hash, pp_path: profilePicture };
  users.push(newUser);
  next_user_id++;

  ctx.response.status = 201;
  ctx.response.body = { status: "success", user: newUser };
});

 // route to get an HttpOnly token (can't be read by javascript on the browser)
router.get("/get_cookie", async (ctx) => {
  try {
    // Generate JWT token
    const token = await create({ alg: "HS512", typ: "JWT" }, { userName: "dummy" }, secretKey); // Adjust algorithm and type as needed

    // Set the token in an HTTP-only cookie
    ctx.response.headers.set("Set-Cookie", `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`);

    // Return success
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (_error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
});

router.get("/", authorizationMiddleware, (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  const username = ctx.state.tokenData.userName;

  // Check if the user is already connected
  const isConnected = connections.some(conn => conn.username === username);
  if (isConnected) {
    ctx.throw(403, "User is already connected");
    return;
  }

  const ws = ctx.upgrade();
  connections.push({ ws, username });
  console.log(`+ websocket connected (${connections.length})`);

  ws.onerror = (_error) => {
    const index = connections.findIndex(conn => conn.ws === ws);
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

    if ("message" in data) {
      const msg = data.message;
      if (msg.length == 0) {
        return;
      }
      notifyAllUsers({ type: "message", message: msg, owner: owner, user_pp_path: user_pp_path });
      return;
    }

    if (data.type === "connected_users") {
      const connectedUsers = connections.map((conn) => {
        const user = users.find((u) => u.username === conn.username);
        return user ? { username: user.username, pp_path: user.pp_path } : { username: conn.username, pp_path: "" };
      });
      console.log("connected users: " + connectedUsers);
      notifyAllUsers({ type: 'connected_users', users: connectedUsers });
      return;
    }

    if (data.type === "card_change") {
      notifyAllUsers({ type: "card_change", card: data.card });
      return;
    }
  };

  ws.onclose = () => {
    const index = connections.findIndex(conn => conn.ws === ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }
    const connectedUsers = connections.map((conn) => {
      const user = users.find((u) => u.username === conn.username);
      return user ? { username: user.username, pp_path: user.pp_path } : { username: conn.username, pp_path: "" };
    });
    console.log("connected users: " + connectedUsers);
    notifyAllUsers({ type: 'connected_users', users: connectedUsers });
    console.log(`- websocket disconnected (${connections.length})`);
  };
});

// the cookie is tested in the middleware (the cookie is provided by the browser in a header)
router.get('/test_cookie', authorizationMiddleware, (ctx) => {
   ctx.response.body = { message: 'Token verified successfully', token_data: ctx.state.tokenData };

});

// Vérification des arguments (port)
if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const options: { port: number; hostname?: string; certFile?: string; keyFile?: string } = { port: Number(Deno.args[0]) };

if (Deno.args.length >= 3) {
  options.certFile = Deno.args[1];
  options.keyFile = Deno.args[2];
  console.log(`SSL conf ready (use https)`);
}

// ✅ Activation du CORS avec plusieurs origines possibles
app.use(
  oakCors({
    origin: ["http://localhost:8080"], // Ajoute les URLs nécessaires
    credentials: true, // Autorise les cookies et authentifications
  })
);

console.log(`Oak back server running on port ${options.port}`);
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen(options);