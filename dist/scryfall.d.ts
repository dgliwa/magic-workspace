export declare class ScryfallCache {
    private readonly path;
    private db;
    constructor(path: string);
    close(): void;
    upsert(card: any, now?: string): void;
    get(identifier: string): any;
    search(query: string, limit?: number): any[];
    status(): {
        path: string;
        count: number;
    };
    refresh(signal?: AbortSignal): Promise<{
        count: number;
        bytes: number;
        updatedAt: string;
        sourceUpdatedAt: any;
    }>;
}
export declare function fetchScryfallCard(input: {
    name?: string;
    id?: string;
    set?: string;
    collectorNumber?: string;
}, signal?: AbortSignal): Promise<any>;
export declare function searchScryfall(query: string, limit?: number, signal?: AbortSignal): Promise<{
    totalCards: number;
    cards: any;
    hasMore: boolean;
}>;
export declare function fetchRandomScryfallCommander(signal?: AbortSignal): Promise<any>;
export declare function searchScryfallAdvanced(query: string, options?: {
    limit?: number;
    unique?: "cards" | "art" | "prints";
    order?: "name" | "set" | "released" | "rarity" | "color" | "usd" | "tix" | "eur" | "cmc" | "power" | "toughness" | "edhrec" | "penny" | "artist" | "review";
    direction?: "auto" | "asc" | "desc";
}, signal?: AbortSignal): Promise<{
    totalCards: number;
    cards: any;
    hasMore: boolean;
}>;
export declare function fetchScryfallCollection(names: string[], signal?: AbortSignal): Promise<{
    cards: any[];
    notFound: any[];
}>;
export declare function fetchScryfallRulings(id: string, signal?: AbortSignal): Promise<any>;
