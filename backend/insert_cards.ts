import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { readAll } from "https://deno.land/std@0.224.0/io/read_all.ts";

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Connect to your PostgreSQL database using environment variables
const client = new Client({
  user: getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD'),
  database: getEnv('DB_NAME'),
  hostname: getEnv('DB_HOST'),
  port: Number(getEnv('DB_PORT')),
});

// Function to check if cards already exist
async function cardsExist(): Promise<boolean> {
  await client.connect();
  const result = await client.queryObject<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Cards"'
  );
  const count = result.rows[0].count;
  console.log(`Found ${count} cards in database`);
  return count > 0;
}

// Function to read an image file as a Uint8Array
async function readImageAsBytes(path: string): Promise<Uint8Array> {
  try {
    const file = await Deno.open(path, { read: true });
    const buffer = await readAll(file);
    file.close();
    return buffer;
  } catch (error) {
    console.error(`Error reading file ${path}:`, (error as Error).message);
    throw error;
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
    for (const suit of suits) {
      for (const rank of ranks) {
        const id = `${rank}_of_${suit}`;
        const path = `/app/cards_images/${id}.png`;
        try {
          console.log(`Reading image ${path}`);
          const imageBytes = await readImageAsBytes(path);
          
          await client.queryObject(
            'INSERT INTO "Cards" ("Picture") VALUES ($1)',
            [imageBytes],
          );
          console.log(`Inserted ${id}`);
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
        const imageBytes = await readImageAsBytes(path);
        await client.queryObject(
          'INSERT INTO "Cards" ("Picture") VALUES ($1)',
          [imageBytes],
        );
        console.log(`Inserted ${name}`);
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