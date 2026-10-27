interface BudgetTier {
    label: string;
    totalUsd: number;
    maxCardUsd: number;
}
export declare function validateCommanderDeck(commanders: string[], mainboard: Array<{
    name: string;
    quantity: number;
}>, signal?: AbortSignal): Promise<{
    valid: boolean;
    totalCards: number;
    commanderColorIdentity: string[];
    uniqueNames: number;
    landCount: number;
    estimatedUsd: number;
    pricedAt: string;
    errors: string[];
    warnings: string[];
    pricingNote: string;
}>;
export declare function commanderWorkshopTools(tool: any): any[];
export declare const commanderWorkshopDefaults: {
    responseChannel: string;
    budgetTiers: BudgetTier[];
    searchOrders: readonly ["edhrec", "name", "released", "usd", "cmc", "color", "rarity"];
};
export {};
