-- Create tables based on UML diagram
CREATE TABLE IF NOT EXISTS "User" (
    "idUser" SERIAL PRIMARY KEY,
    "Username" VARCHAR(50) NOT NULL UNIQUE,
    "Password" VARCHAR(255) NOT NULL,
    "Profile_picture" BYTEA,
    "isAdmin" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "Game" (
    "idGame" SERIAL PRIMARY KEY,
    "DateCreated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "GameType" VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Game_Users" (
    "idUsers" INT REFERENCES "User"("idUser"),
    "idGame" INT REFERENCES "Game"("idGame"),
    PRIMARY KEY ("idUsers", "idGame")
);

-- New Cards table for card types
CREATE TABLE IF NOT EXISTS "Cards" (
    "idCardType" SERIAL PRIMARY KEY,
    "Picture" BYTEA NOT NULL
);

-- Renamed from Cards to ActiveCards with additional fields
CREATE TABLE IF NOT EXISTS "ActiveCards" (
    "idCard" SERIAL PRIMARY KEY,
    "idGame" INT REFERENCES "Game"("idGame"),
    "idUserHoldingIt" INT REFERENCES "User"("idUser"),
    "CardState" VARCHAR(50) NOT NULL,
    "cardType" INT REFERENCES "Cards"("idCardType"),
    CONSTRAINT check_card_state 
        CHECK ("CardState" IN ('in_deck', 'in_hand', 'played', 'discarded'))
);

CREATE TABLE IF NOT EXISTS "ChatMessages" (
    "idMessages" SERIAL PRIMARY KEY,
    "idGame" INT REFERENCES "Game"("idGame"),
    "TextContent" TEXT NOT NULL,
    "Timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GamesResults" (
    "idGame" INT REFERENCES "Game"("idGame"),
    "idUser" INT REFERENCES "User"("idUser"),
    "FinalScore" INT NOT NULL,
    "DatePlayed" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("idGame", "idUser")
);

-- Add constraints
ALTER TABLE "Game" ADD CONSTRAINT check_game_type
    CHECK ("GameType" IN ('classic', 'timed', 'tournament'));
