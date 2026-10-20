interface BudgetTier {
    label: string;
    totalUsd: number;
    maxCardUsd: number;
}
export declare function commanderWorkshopTools(tool: any): any[];
export declare const commanderWorkshopDefaults: {
    responseChannel: string;
    budgetTiers: BudgetTier[];
    searchOrders: readonly ["edhrec", "name", "released", "usd", "cmc", "color", "rarity"];
};
export {};
