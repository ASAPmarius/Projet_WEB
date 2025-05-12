import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { convertImageToBytes } from "./convertIMG.ts";

console.log("Starting Heroku database initialization...");

// Get database connection details from Heroku's DATABASE_URL
const databaseUrl = Deno.env.get('DATABASE_URL');
if (!databaseUrl) {
  console.error("DATABASE_URL environment variable not found");
  Deno.exit(1);
}

function getDatabaseConfig() {
  const databaseUrl = Deno.env.get('DATABASE_URL');
  
  if (databaseUrl) {
    try {
      // Parse DATABASE_URL for Heroku
      const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
      const match = databaseUrl.match(regex);
      
      if (match) {
        const [, user, password, host, port, database] = match;
        console.log("Using Heroku Postgres configuration");
        return {
          user,
          password,
          database,
          hostname: host,
          port: Number(port),
          ssl: { rejectUnauthorized: false }, // Required for Heroku Postgres
        };
      }
    } catch (error) {
      console.error("Error parsing DATABASE_URL:", error);
    }
  }
  
  throw new Error("Unable to configure database connection");
}

// Initialize client
const client = new Client(getDatabaseConfig());

// Function to check if cards already exist
async function cardsExist(): Promise<boolean> {
  try {
    await client.connect();
    const result = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Cards"'
    );
    const count = result.rows[0].count;
    console.log(`Found ${count} cards in database`);
    return count > 0;
  } catch (error) {
    console.error("Error checking card count:", error);
    return false;
  }
}

async function insertCards() {
  try {
    // Check if cards already exist
    if (await cardsExist()) {
      console.log("Cards already exist in database, skipping insertion");
      await client.end();
      return;
    }

    // List of suits and ranks
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    const ranks = [
      "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "jack", "queen", "king", "ace",
    ];

    console.log("Starting card insertion...");

    // Insert all 52 standard cards
    let cardId = 1;
    for (const suit of suits) {
      for (const rank of ranks) {
        const id = `${rank}_of_${suit}`;
        const path = `/app/cards_images/${id}.png`;
        try {
          console.log(`Reading image ${path}`);
          const imageBytes = await convertImageToBytes(path);
          
          // Insert into the Cards table
          await client.queryObject(
            'INSERT INTO "Cards" ("idCardType", "Picture") VALUES ($1, $2)',
            [cardId, imageBytes],
          );
          console.log(`Inserted ${id} with ID ${cardId}`);
          cardId++;
        } catch (err) {
          console.error(`Failed to insert ${id}:`, (err as Error).message);
        }
      }
    }

    // Insert joker and back of card
    const specialCards = ["red_joker", "card_back_blue"];
    for (const name of specialCards) {
      const path = `/app/cards_images/${name}.png`;
      try {
        const imageBytes = await convertImageToBytes(path);
        await client.queryObject(
          'INSERT INTO "Cards" ("idCardType", "Picture") VALUES ($1, $2)',
          [cardId, imageBytes],
        );
        console.log(`Inserted ${name} with ID ${cardId}`);
        cardId++;
      } catch (err) {
        console.error(`Failed to insert ${name}:`, (err as Error).message);
      }
    }

    console.log("Card insertion complete!");
  } catch (error) {
    console.error("Error in card insertion process:", (error as Error).message);
  } finally {
    await client.end();
  }
}

// Run the insertion process
insertCards();