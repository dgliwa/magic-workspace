import type { CollectionEntry, DeckSnapshot } from "./types.js";
export declare function fetchMoxfieldDeck(input: string): Promise<DeckSnapshot>;
export declare function fetchMoxfieldCollection(input: string): Promise<CollectionEntry[]>;
