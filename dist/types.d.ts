export declare const DECK_BOARDS: readonly ["commanders", "mainboard", "sideboard", "maybeboard"];
export type DeckBoard = typeof DECK_BOARDS[number];
export interface DeckCard {
    name: string;
    quantity: number;
    board: DeckBoard;
    scryfallId?: string;
    moxfieldCardId?: string;
    set?: string;
    collectorNumber?: string;
}
export interface DeckSnapshot {
    publicId?: string;
    internalId?: string;
    name: string;
    format?: string;
    url?: string;
    updatedAt?: string;
    cards: DeckCard[];
    source: "local" | "moxfield" | "generated";
}
export interface LocalDeck {
    key: string;
    directory: string;
    deckFile: string;
    readmeFile?: string;
    moxfieldUrl?: string;
    cardCount: number;
    uniqueCards: number;
    commander?: string;
    active: boolean;
}
export interface CollectionEntry {
    name: string;
    count: number;
    tradelistCount: number;
    edition?: string;
    condition?: string;
    language?: string;
    foil: boolean;
    collectorNumber?: string;
    purchasePrice?: number;
}
export interface Availability {
    name: string;
    owned: number;
    reserved: number;
    available: number;
    reservedBy: Array<{
        deck: string;
        quantity: number;
    }>;
}
