// models.ts - Types and interfaces for the backend

// User model
export interface User {
  idUser: number;
  Username: string;
  Password: string;
  Profile_picture: Uint8Array | null;
  isAdmin: boolean;
  Bio?: string;
  Favorite_song?: string;
}

// Game model
export interface Game {
  idGame: number;
  DateCreated: Date;
  GameType: string;
  GameStatus: string;
  GameState?: GameState;
}

// Card model
export interface Card {
  idCardType: number;
  Picture: Uint8Array;
}

// Chat message model
export interface ChatMessage {
  idMessages: number;
  idGame: number;
  idUser: number;
  TextContent: string;
  Timestamp: Date;
}

// Add to backend/models.ts if not already there
export interface CardMetadata {
  id: number;
  suit: string;
  rank: string;
  value: number;
  picture: string;
}

// Update in backend/models.ts
export interface GameState {
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  currentTurn: number | null;
  round: number;
  startTime?: Date;
  lastActionTime?: Date;
  
  // Remove the ? to make these required properties
  playerHands: Record<number, CardMetadata[]>;
  playedCards: Record<number, CardMetadata | null>;
  warPile: CardMetadata[];
  lastWinner: number | null;
}

// Player state in game
export interface PlayerState {
  id: number;
  username: string;
  connected: boolean;
  cardCount?: number;
}

// WebSocket message types
export type WebSocketMessage =
  | { type: 'join_game'; gameId: number; auth_token: string; }
  | { type: 'player_action'; action: PlayerAction; gameId: number; auth_token: string; }
  | { type: 'chat_message'; message: string; gameId: number; auth_token: string; }
  | { type: 'sync_request'; gameId: number; auth_token: string; }
  | { type: 'connected_users'; gameId: number; auth_token: string; }
  | { type: 'game_state_request'; gameId: number; auth_token: string; }
  | { type: 'card_request'; gameId: number; auth_token: string; }
  | { type: 'hand_request'; gameId: number; auth_token: string; }
  | { type: 'update_game_state'; gameId: number; gameState: GameState; auth_token: string;}
  | { type: 'update_round'; userId: number; auth_token: string; }
  | { type: 'turn_change'; playerId: number; gameId: number; username?: string; auth_token: string; };

// Player action types
export interface PlayerAction {
  type: 'draw_card' | 'play_card' | 'discard_card' | 'play_war_cards';
  cardId?: number;
  cardType?: number;
  count?: number;
}

// Card metadata
export interface CardMetadata {
  id: number;
  suit: string;
  rank: string;
  value: number;
  picture: string;
}

// Connection information
export interface Connection {
  ws: WebSocket;
  username: string;
  gameId: number | null;
  userId: number;
}