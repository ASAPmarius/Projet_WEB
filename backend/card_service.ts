// card_service.ts - Card handling service

import { Card } from "./models.ts";
import { Client } from "postgres";
import { bytesToDataURL } from "./convertIMG.ts";

export class CardService {
  private client: Client;
  private cardCache: Map<number, { data: Uint8Array; metadata: any }> = new Map();
  
  constructor(dbClient: Client) {
    this.client = dbClient;
  }
  
  // Load all cards from database
  async loadAllCards(): Promise<Card[]> {
    const result = await this.client.queryObject<Card>(
      'SELECT * FROM "Cards" ORDER BY "idCardType"'
    );
    return result.rows;
  }
  
  // Get card metadata based on card type ID
  getCardMetadata(cardTypeId: number): { suit: string; rank: string; value: number } {
    // Card IDs 1-52 are standard playing cards
    if (cardTypeId < 1 || cardTypeId > 54) {
      return { suit: 'unknown', rank: 'unknown', value: 0 };
    }
    
    // Card ID 53 is joker, 54 is card back
    if (cardTypeId === 53) {
      return { suit: 'special', rank: 'joker', value: 0 };
    }
    
    if (cardTypeId === 54) {
      return { suit: 'special', rank: 'back', value: 0 };
    }
    
    // For standard cards (1-52)
    // Suit: 1-13 = hearts, 14-26 = diamonds, 27-39 = clubs, 40-52 = spades
    // Rank: Each suit starts with 2 and ends with Ace
    
    let suitIndex = Math.floor((cardTypeId - 1) / 13);
    let rankIndex = (cardTypeId - 1) % 13;
    
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
    const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // Values for comparison (Ace high)
    
    return {
      suit: suits[suitIndex],
      rank: ranks[rankIndex],
      value: values[rankIndex]
    };
  }
  
  // Get all cards with metadata
  async getAllCardsWithMetadata(): Promise<any[]> {
    const cards = await this.loadAllCards();
    
    return cards.map(card => {
      const metadata = this.getCardMetadata(card.idCardType);
      const imageData = bytesToDataURL(card.Picture, 'image/png');
      
      return {
        id: card.idCardType,
        suit: metadata.suit,
        rank: metadata.rank,
        value: metadata.value,
        picture: imageData
      };
    });
  }
  
  // Get card back image
  async getCardBackImage(): Promise<string> {
    const result = await this.client.queryObject<Card>(
      'SELECT "Picture" FROM "Cards" WHERE "idCardType" = 54'
    );
    
    if (result.rows.length > 0) {
      return bytesToDataURL(result.rows[0].Picture, 'image/png');
    }
    
    return '';
  }
}