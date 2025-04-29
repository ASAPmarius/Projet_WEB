-- Initialize database with game persistence functionality and turn-based mechanics
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
    "GameState" JSONB, -- Added JSONB column for storing game state
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

-- Create a more detailed game statistics view
CREATE OR REPLACE VIEW game_stats_view AS
SELECT 
    g."idGame",
    g."GameType",
    g."GameStatus",
    g."DateCreated",
    COUNT(DISTINCT gu."idUsers") as player_count,
    COUNT(DISTINCT CASE WHEN ac."CardState" = 'in_deck' THEN ac."idCard" END) as cards_in_deck,
    COUNT(DISTINCT CASE WHEN ac."CardState" = 'in_hand' THEN ac."idCard" END) as cards_in_hands,
    COUNT(DISTINCT CASE WHEN ac."CardState" = 'played' THEN ac."idCard" END) as cards_played,
    COUNT(DISTINCT CASE WHEN ac."CardState" = 'discarded' THEN ac."idCard" END) as cards_discarded,
    g."GameState"::jsonb->'currentTurn' as current_turn,
    g."GameState"::jsonb->'phase' as game_phase,
    g."GameState"::jsonb->'round' as game_round
FROM 
    "Game" g
LEFT JOIN 
    "Game_Users" gu ON g."idGame" = gu."idGame"
LEFT JOIN 
    "ActiveCards" ac ON g."idGame" = ac."idGame"
GROUP BY 
    g."idGame";

-- Create a function to finish a game
CREATE OR REPLACE FUNCTION finish_game(game_id INT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if game exists and is active
    IF NOT EXISTS (SELECT 1 FROM "Game" WHERE "idGame" = game_id AND "GameStatus" = 'active') THEN
        RETURN FALSE;
    END IF;
    
    -- Update game status and game state phase
    UPDATE "Game" 
    SET 
        "GameStatus" = 'finished',
        "GameState" = CASE 
            WHEN "GameState" IS NOT NULL 
            THEN jsonb_set("GameState", '{phase}', '"finished"')
            ELSE '{"phase": "finished"}'::jsonb
        END
    WHERE "idGame" = game_id;
    
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

-- Function to advance to the next player's turn
CREATE OR REPLACE FUNCTION advance_game_turn(game_id INT)
RETURNS BOOLEAN AS $$
DECLARE
    game_state JSONB;
    players INT[];
    current_player INT;
    current_index INT;
    next_index INT;
    direction INT;
BEGIN
    -- Get current game state
    SELECT "GameState" INTO game_state 
    FROM "Game" 
    WHERE "idGame" = game_id;
    
    -- If no game state, return false
    IF game_state IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get the turn direction (1 for clockwise, -1 for counter-clockwise)
    direction := COALESCE((game_state->>'turnDirection')::INT, 1);
    
    -- Get players in the game ordered by join time
    SELECT ARRAY_AGG("idUsers" ORDER BY "idUsers") INTO players
    FROM "Game_Users"
    WHERE "idGame" = game_id;
    
    -- Get current player
    current_player := (game_state->>'currentTurn')::INT;
    
    -- Find the index of the current player
    SELECT idx INTO current_index
    FROM unnest(players) WITH ORDINALITY AS t(player_id, idx)
    WHERE player_id = current_player;
    
    -- Calculate next player index
    IF current_index IS NULL THEN
        -- If no current player, start with the first player
        next_index := 1;
    ELSE
        -- Calculate next index, handling wrapping around the array
        next_index := MOD(current_index - 1 + direction + array_length(players, 1), array_length(players, 1)) + 1;
    END IF;
    
    -- Update the game state with the new turn
    UPDATE "Game"
    SET "GameState" = jsonb_set(
        jsonb_set(
            game_state,
            '{currentTurn}',
            to_jsonb(players[next_index])
        ),
        '{lastActionTime}',
        to_jsonb(now())
    )
    WHERE "idGame" = game_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to start a game
CREATE OR REPLACE FUNCTION start_game(game_id INT)
RETURNS BOOLEAN AS $$
DECLARE
    game_state JSONB;
    player_count INT;
    first_player INT;
BEGIN
    -- Check if the game exists and is active
    SELECT COUNT(*) INTO player_count
    FROM "Game_Users"
    WHERE "idGame" = game_id;
    
    -- Need at least 2 players to start
    IF player_count < 2 THEN
        RETURN FALSE;
    END IF;
    
    -- Get the first player
    SELECT "idUsers" INTO first_player
    FROM "Game_Users"
    WHERE "idGame" = game_id
    LIMIT 1;
    
    -- Create initial game state if not exists
    SELECT "GameState" INTO game_state
    FROM "Game"
    WHERE "idGame" = game_id;
    
    IF game_state IS NULL THEN
        -- Initialize with default state
        game_state := '{"phase": "waiting", "currentTurn": null, "turnDirection": 1, "round": 1}'::jsonb;
    END IF;
    
    -- Update to playing phase and set first player's turn
    UPDATE "Game"
    SET "GameState" = jsonb_set(
        jsonb_set(
            jsonb_set(
                game_state,
                '{phase}',
                '"playing"'
            ),
            '{currentTurn}',
            to_jsonb(first_player)
        ),
        '{startTime}',
        to_jsonb(now())
    )
    WHERE "idGame" = game_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a player can play a card (based on turn)
CREATE OR REPLACE FUNCTION can_play_card(game_id INT, player_id INT)
RETURNS BOOLEAN AS $$
DECLARE
    game_state JSONB;
    current_turn INT;
BEGIN
    -- Get current game state
    SELECT "GameState" INTO game_state 
    FROM "Game" 
    WHERE "idGame" = game_id;
    
    -- If no game state or not in playing phase, return false
    IF game_state IS NULL OR game_state->>'phase' <> 'playing' THEN
        RETURN FALSE;
    END IF;
    
    -- Get current turn
    current_turn := (game_state->>'currentTurn')::INT;
    
    -- Check if it's the player's turn
    RETURN current_turn = player_id;
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
$$ LANGUAGE plpgsql;

-- Add trigger for game end detection
CREATE OR REPLACE FUNCTION check_game_end()
RETURNS TRIGGER AS $$
DECLARE
    card_count INT;
    game_state JSONB;
BEGIN
    -- Check if a player has no cards left
    IF NEW."CardState" = 'played' OR NEW."CardState" = 'discarded' THEN
        -- Count remaining cards for this player
        SELECT COUNT(*) INTO card_count
        FROM "ActiveCards"
        WHERE "idGame" = NEW."idGame" 
          AND "idUserHoldingIt" = OLD."idUserHoldingIt"
          AND "CardState" = 'in_hand';
          
        -- If player has no cards left, update game state to finished
        IF card_count = 0 THEN
            -- Get current game state
            SELECT "GameState" INTO game_state 
            FROM "Game" 
            WHERE "idGame" = NEW."idGame";
            
            -- Update to finished state with winner
            UPDATE "Game"
            SET "GameState" = jsonb_set(
                jsonb_set(
                    COALESCE(game_state, '{}'::jsonb),
                    '{phase}',
                    '"finished"'
                ),
                '{winner}',
                to_jsonb(OLD."idUserHoldingIt")
            ),
            "GameStatus" = 'finished'
            WHERE "idGame" = NEW."idGame";
            
            -- Calculate and record final scores
            INSERT INTO "GamesResults" ("idGame", "idUser", "FinalScore")
            SELECT 
                NEW."idGame",
                "idUserHoldingIt",
                COUNT(*) AS "FinalScore"
            FROM 
                "ActiveCards"
            WHERE 
                "idGame" = NEW."idGame" AND
                "idUserHoldingIt" IS NOT NULL
            GROUP BY 
                "idUserHoldingIt"
            ON CONFLICT ("idGame", "idUser") DO UPDATE 
            SET "FinalScore" = EXCLUDED."FinalScore";
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_game_status_change
AFTER UPDATE OF "GameStatus" ON "Game"
FOR EACH ROW
EXECUTE FUNCTION cleanup_finished_game();

-- Create trigger for game end detection
DROP TRIGGER IF EXISTS trg_check_game_end ON "ActiveCards";
CREATE TRIGGER trg_check_game_end
AFTER UPDATE OF "CardState" ON "ActiveCards"
FOR EACH ROW
EXECUTE FUNCTION check_game_end();

-- Comments for documentation
COMMENT ON TABLE "Game" IS 'Stores game information with persistence through GameStatus field';
COMMENT ON COLUMN "Game"."GameStatus" IS 'Tracks game lifecycle: active, finished, or canceled';
COMMENT ON COLUMN "Game"."GameState" IS 'JSON object containing game state information like current turn, phase, etc.';
COMMENT ON VIEW active_games_view IS 'Shows active games with player count and cards in deck';
COMMENT ON VIEW game_stats_view IS 'Detailed statistics about games including card distribution and current game state';
COMMENT ON FUNCTION finish_game IS 'Safely mark a game as finished';
COMMENT ON FUNCTION cancel_game IS 'Safely mark a game as canceled';
COMMENT ON FUNCTION add_user_to_game IS 'Add a user to an active game if not already added';
COMMENT ON FUNCTION advance_game_turn IS 'Advances to the next player''s turn in the game';
COMMENT ON FUNCTION start_game IS 'Initializes and starts a game with at least 2 players';
COMMENT ON FUNCTION can_play_card IS 'Checks if a player can play a card (based on whose turn it is)';
COMMENT ON FUNCTION check_game_end IS 'Checks if a player has won the game by playing their last card';