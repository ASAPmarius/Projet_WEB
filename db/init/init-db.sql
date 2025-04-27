-- Initialize database with game persistence functionality
-- Drop and recreate tables if needed (comment out in production)
-- DROP TABLE IF EXISTS "GamesResults", "ChatMessages", "ActiveCards", "Game_Users", "Cards", "Game", "User" CASCADE;

-- Create tables based on UML diagram with game persistence support
CREATE TABLE IF NOT EXISTS "User" (
    "idUser" SERIAL PRIMARY KEY,
    "Username" VARCHAR(50) NOT NULL UNIQUE,
    "Password" VARCHAR(255) NOT NULL,
    "Profile_picture" BYTEA,
    "isAdmin" BOOLEAN DEFAULT FALSE,
    "Bio" TEXT,
    "Favorite_song" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS "Game" (
    "idGame" SERIAL PRIMARY KEY,
    "DateCreated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "GameType" VARCHAR(50) NOT NULL,
    "GameStatus" VARCHAR(20) DEFAULT 'active',
    CONSTRAINT check_game_type
        CHECK ("GameType" IN ('classic', 'timed', 'tournament')),
    CONSTRAINT check_game_status
        CHECK ("GameStatus" IN ('active', 'finished', 'canceled'))
);

CREATE TABLE IF NOT EXISTS "Game_Users" (
    "idUsers" INT REFERENCES "User"("idUser") ON DELETE CASCADE,
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    PRIMARY KEY ("idUsers", "idGame")
);

-- Cards table for card types
CREATE TABLE IF NOT EXISTS "Cards" (
    "idCardType" SERIAL PRIMARY KEY,
    "Picture" BYTEA NOT NULL
);

-- ActiveCards table for cards in games
CREATE TABLE IF NOT EXISTS "ActiveCards" (
    "idCard" SERIAL PRIMARY KEY,
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    "idUserHoldingIt" INT REFERENCES "User"("idUser") ON DELETE SET NULL,
    "CardState" VARCHAR(50) NOT NULL,
    "cardType" INT REFERENCES "Cards"("idCardType") ON DELETE CASCADE,
    CONSTRAINT check_card_state 
        CHECK ("CardState" IN ('in_deck', 'in_hand', 'played', 'discarded'))
);

CREATE TABLE IF NOT EXISTS "ChatMessages" (
    "idMessages" SERIAL PRIMARY KEY,
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    "idUser" INT REFERENCES "User"("idUser") ON DELETE SET NULL,
    "TextContent" TEXT NOT NULL,
    "Timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GamesResults" (
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    "idUser" INT REFERENCES "User"("idUser") ON DELETE CASCADE,
    "FinalScore" INT NOT NULL,
    "DatePlayed" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("idGame", "idUser")
);

-- Create indexes for improved performance
CREATE INDEX IF NOT EXISTS idx_game_status ON "Game" ("GameStatus");
CREATE INDEX IF NOT EXISTS idx_game_users ON "Game_Users" ("idUsers", "idGame");
CREATE INDEX IF NOT EXISTS idx_active_cards_game ON "ActiveCards" ("idGame");
CREATE INDEX IF NOT EXISTS idx_active_cards_user ON "ActiveCards" ("idUserHoldingIt") WHERE "idUserHoldingIt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_game ON "ChatMessages" ("idGame");
CREATE INDEX IF NOT EXISTS idx_games_results_user ON "GamesResults" ("idUser");

-- Create a view for active games with player count
CREATE OR REPLACE VIEW active_games_view AS
SELECT g."idGame", g."GameType", g."DateCreated", g."GameStatus", 
       COUNT(DISTINCT gu."idUsers") as player_count,
       COUNT(DISTINCT CASE WHEN ac."CardState" = 'in_deck' THEN ac."idCard" END) as cards_in_deck
FROM "Game" g
LEFT JOIN "Game_Users" gu ON g."idGame" = gu."idGame"
LEFT JOIN "ActiveCards" ac ON g."idGame" = ac."idGame"
WHERE g."GameStatus" = 'active'
GROUP BY g."idGame";

-- Create a function to finish a game
CREATE OR REPLACE FUNCTION finish_game(game_id INT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if game exists and is active
    IF NOT EXISTS (SELECT 1 FROM "Game" WHERE "idGame" = game_id AND "GameStatus" = 'active') THEN
        RETURN FALSE;
    END IF;
    
    -- Update game status
    UPDATE "Game" SET "GameStatus" = 'finished' WHERE "idGame" = game_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to cancel a game
CREATE OR REPLACE FUNCTION cancel_game(game_id INT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if game exists and is active
    IF NOT EXISTS (SELECT 1 FROM "Game" WHERE "idGame" = game_id AND "GameStatus" = 'active') THEN
        RETURN FALSE;
    END IF;
    
    -- Update game status
    UPDATE "Game" SET "GameStatus" = 'canceled' WHERE "idGame" = game_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to add a user to a game
CREATE OR REPLACE FUNCTION add_user_to_game(user_id INT, game_id INT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if game exists and is active
    IF NOT EXISTS (SELECT 1 FROM "Game" WHERE "idGame" = game_id AND "GameStatus" = 'active') THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user exists
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "idUser" = user_id) THEN
        RETURN FALSE;
    END IF;
    
    -- Add user to game if not already added
    INSERT INTO "Game_Users" ("idUsers", "idGame")
    VALUES (user_id, game_id)
    ON CONFLICT DO NOTHING;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically clean up active cards when a game is finished
CREATE OR REPLACE FUNCTION cleanup_finished_game()
RETURNS TRIGGER AS $$
BEGIN
    -- If the game status changed to 'finished' or 'canceled'
    IF NEW."GameStatus" IN ('finished', 'canceled') AND 
       (OLD."GameStatus" IS NULL OR OLD."GameStatus" = 'active') THEN
        
        -- Calculate final scores based on cards held before deleting cards
        INSERT INTO "GamesResults" ("idGame", "idUser", "FinalScore")
        SELECT 
            NEW."idGame",
            "idUserHoldingIt",
            COUNT(*) AS "FinalScore"
        FROM 
            "ActiveCards"
        WHERE 
            "idGame" = NEW."idGame" AND
            "idUserHoldingIt" IS NOT NULL AND
            "CardState" = 'in_hand'
        GROUP BY 
            "idUserHoldingIt"
        ON CONFLICT ("idGame", "idUser") DO UPDATE 
        SET "FinalScore" = EXCLUDED."FinalScore";
        
        -- Delete all active cards associated with this game
        DELETE FROM "ActiveCards" WHERE "idGame" = NEW."idGame";
        
        -- Log game completion
        RAISE NOTICE 'Game % finished and cards deleted', NEW."idGame";
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_game_status_change
AFTER UPDATE OF "GameStatus" ON "Game"
FOR EACH ROW
EXECUTE FUNCTION cleanup_finished_game();

-- Comments for documentation
COMMENT ON TABLE "Game" IS 'Stores game information with persistence through GameStatus field';
COMMENT ON COLUMN "Game"."GameStatus" IS 'Tracks game lifecycle: active, finished, or canceled';
COMMENT ON VIEW active_games_view IS 'Shows active games with player count and cards in deck';
COMMENT ON FUNCTION finish_game IS 'Safely mark a game as finished';
COMMENT ON FUNCTION cancel_game IS 'Safely mark a game as canceled';
COMMENT ON FUNCTION add_user_to_game IS 'Add a user to an active game if not already added';
