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
        tags: {
            tag: string;
            deckCount: number;
        }[];
        untaggedActiveDecks: number;
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
        tag?: string;
    }): {
        tags: string[];
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
        tags: string[];
    };
    setTags(publicId: string, tags: string[], now?: string): {
        publicId: string;
        tags: string[];
    };
    addTag(publicId: string, tag: string, now?: string): {
        publicId: string;
        tags: string[];
    };
    removeTag(publicId: string, tag: string): {
        publicId: string;
        tags: string[];
    };
    tags(publicId: string): string[];
    tagSummary(): {
        tags: {
            tag: string;
            deckCount: number;
        }[];
        untaggedActiveDecks: number;
    };
    account(): MoxfieldAccount & {
        discoveredAt?: string;
    };
    status(): {
        tags: {
            tag: string;
            deckCount: number;
        }[];
        untaggedActiveDecks: number;
        path: string;
        account: MoxfieldAccount & {
            discoveredAt?: string;
        };
        totalDecks: number;
        activeDecks: number;
        archivedDecks: number;
        cachedDecks: number;
    };
    private assertDeck;
}
