import type { DeckSnapshot } from "./types.js";
export interface DiscoveredDeck {
    publicId: string;
    internalId?: string;
    name: string;
    format?: string;
    visibility?: string;
    publicUrl: string;
    updatedAt?: string;
}
export interface MoxfieldAccount {
    userName?: string;
    userId?: string;
    collectionPublicId?: string;
    collectionUrl?: string;
}
export declare class MoxfieldRegistry {
    private readonly path;
    private readonly db;
    constructor(path: string);
    close(): void;
    importDiscovery(account: MoxfieldAccount, decks: DiscoveredDeck[], now?: string): {
        path: string;
        account: MoxfieldAccount & {
            discoveredAt?: string;
        };
        totalDecks: number;
        activeDecks: number;
        archivedDecks: number;
        cachedDecks: number;
    };
    saveSnapshot(snapshot: DeckSnapshot, now?: string): void;
    list(options?: {
        includeArchived?: boolean;
        query?: string;
    }): {
        publicId: string;
        internalId: string | undefined;
        name: string;
        format: string | undefined;
        visibility: string | undefined;
        publicUrl: string;
        remoteUpdatedAt: string | undefined;
        snapshotRefreshedAt: string | undefined;
        archivedAt: string | undefined;
        cardCount: number;
        uniqueCards: number;
    }[];
    get(publicId: string): DeckSnapshot & {
        visibility?: string;
        archivedAt?: string;
    };
    account(): MoxfieldAccount & {
        discoveredAt?: string;
    };
    status(): {
        path: string;
        account: MoxfieldAccount & {
            discoveredAt?: string;
        };
        totalDecks: number;
        activeDecks: number;
        archivedDecks: number;
        cachedDecks: number;
    };
}
