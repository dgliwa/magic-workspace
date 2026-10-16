import type { Availability, CollectionEntry, DeckBoard, DeckCard, DeckSnapshot, LocalDeck } from "./types.js";
export declare function parseDeckText(content: string, board?: DeckBoard): DeckCard[];
export declare function listDecks(root: string): LocalDeck[];
export declare function getLocalDeck(root: string, key: string): DeckSnapshot & {
    local: LocalDeck;
};
export declare function writeDeckSnapshot(root: string, key: string, snapshot: DeckSnapshot): DeckSnapshot & {
    local: LocalDeck;
};
export declare function diffDecks(local: DeckSnapshot, remote: DeckSnapshot): {
    name: string;
    local: number;
    moxfield: number;
}[];
export declare function configuredCollection(root: string): {
    url: string;
    path: string;
    active: string;
};
export declare function writeCollection(root: string, entries: CollectionEntry[]): {
    rows: number;
    totalCards: number;
    uniqueNames: number;
    reservedCards: number;
    availableCards: number;
    activeDecks: number;
    lastModified: string;
};
export declare function readCollection(root: string): CollectionEntry[];
export declare function cardAvailability(root: string, name: string): Availability;
export declare function searchCollection(root: string, query: string, limit?: number): {
    name: string;
    count: number;
    foil: number;
    editions: string[];
    availability: Availability;
}[];
export declare function collectionSummary(root: string): {
    rows: number;
    totalCards: number;
    uniqueNames: number;
    reservedCards: number;
    availableCards: number;
    activeDecks: number;
    lastModified: string;
};
export declare function exportSummaries(root: string): void;
