import type { DiscoveredDeck, MoxfieldAccount } from "./moxfield-registry.js";
export declare function exchangeSessionCookie(cookieHeader: string): Promise<{
    token: string;
    account: MoxfieldAccount;
}>;
export declare function normalizeDiscoveredDecks(payload: any): DiscoveredDeck[];
export declare function discoverMoxfieldDecks(token: string): Promise<DiscoveredDeck[]>;
