import { Type } from "typebox";
import { fetchRandomScryfallCommander, fetchScryfallCard, fetchScryfallCollection, searchScryfallAdvanced } from "./scryfall.js";
const DEFAULT_MAGIC_CHANNEL = "channel:1560498017394499706";
const SEARCH_ORDERS = ["edhrec", "name", "released", "usd", "cmc", "color", "rarity"];
const defaultBudgetTiers = [
    { label: "budget", totalUsd: 50, maxCardUsd: 3 },
    { label: "established", totalUsd: 125, maxCardUsd: 10 },
    { label: "premium-casual", totalUsd: 250, maxCardUsd: 30 },
];
function compact(card) {
    const usd = numericPrice(card.prices?.usd);
    return {
        id: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        manaCost: card.mana_cost,
        cmc: card.cmc,
        typeLine: card.type_line,
        oracleText: card.oracle_text,
        power: card.power,
        toughness: card.toughness,
        loyalty: card.loyalty,
        colorIdentity: card.color_identity ?? [],
        keywords: card.keywords ?? [],
        legalities: card.legalities,
        edhrecRank: card.edhrec_rank ?? null,
        prices: card.prices,
        usd,
        scryfallUri: card.scryfall_uri,
        imageUris: card.image_uris,
        cardFaces: card.card_faces,
    };
}
function numericPrice(value) {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}
function colorIdentityClause(identity) {
    if (identity.length === 0)
        return "id:c";
    return `id<=${identity.join("").toLocaleLowerCase()}`;
}
function normalizeBudgetTiers(value) {
    return (value ?? defaultBudgetTiers).map((tier) => ({
        label: tier.label.trim(),
        totalUsd: Number(tier.totalUsd.toFixed(2)),
        maxCardUsd: Number(tier.maxCardUsd.toFixed(2)),
    }));
}
function responseChannel(config) {
    const configured = config.commanderWorkshopDiscordTarget;
    return typeof configured === "string" && configured.length > 0 ? configured : DEFAULT_MAGIC_CHANNEL;
}
function validateCommander(card) {
    if (card.legalities?.commander !== "legal") {
        throw new Error(`${card.name ?? "Selected card"} is not currently legal as a Commander commander.`);
    }
}
async function searchTheme(input, signal) {
    const commanders = [];
    for (const [index, name] of input.commanderNames.entries()) {
        if (index > 0)
            await delay(100, signal);
        const commander = await fetchScryfallCard({ name }, signal);
        validateCommander(commander);
        commanders.push(commander);
    }
    const tiers = normalizeBudgetTiers(input.budgetTiers);
    const identity = [...new Set(commanders.flatMap((commander) => Array.isArray(commander.color_identity) ? commander.color_identity.map(String) : []))];
    const legality = `legal:commander ${colorIdentityClause(identity)}`;
    const resultsPerSearch = input.resultsPerSearch ?? 25;
    const buckets = [];
    const allCards = new Map();
    for (const [index, search] of input.searches.entries()) {
        signal?.throwIfAborted();
        if (index > 0)
            await delay(100, signal);
        const effectiveQuery = `(${search.query}) ${legality}`;
        const result = await searchScryfallAdvanced(effectiveQuery, {
            limit: resultsPerSearch,
            order: "edhrec",
            unique: "cards",
            direction: "asc",
        }, signal);
        const commanderNames = new Set(commanders.map((commander) => commander.name));
        const cards = result.cards.map((card) => compact(card)).filter((card) => !commanderNames.has(card.name));
        for (const card of cards)
            allCards.set(card.oracleId ?? card.id, card);
        buckets.push({
            role: search.role,
            requestedQuery: search.query,
            effectiveQuery,
            totalMatches: result.totalCards,
            hasMore: result.hasMore,
            cards,
        });
    }
    const candidates = [...allCards.values()].map((card) => ({
        ...card,
        eligibleBudgetTiers: tiers
            .filter((tier) => card.usd === null || card.usd <= tier.maxCardUsd)
            .map((tier) => tier.label),
    }));
    return {
        commanders: commanders.map(compact),
        combinedColorIdentity: identity.sort(),
        theme: input.theme,
        budgetTiers: tiers,
        searchPolicy: {
            legality,
            order: "edhrec",
            note: "Scryfall's EDHREC order is global Commander popularity, not commander-specific synergy. Theme fit must come from the advanced queries and card analysis.",
        },
        buckets,
        candidates,
        pricingNote: "USD values are current Scryfall prices for returned printings and are planning estimates, not guaranteed checkout totals. Price the final 100-card lists again before presenting totals.",
        deckbuildingInstructions: [
            "Build the same confirmed theme at each budget tier rather than unrelated decks.",
            "For each tier, produce a complete Commander-legal list or clearly label it as a shell if evidence is insufficient.",
            "Call magic_commander_deck_validate for every completed tier before presenting it; also review mana, ramp, draw, interaction, protection, recovery, and win conditions.",
            "Explain substitutions and upgrades between tiers; do not silently replace the confirmed theme with generic staples.",
        ],
    };
}
async function validateDeck(commanders, mainboard, signal) {
    const requested = [...commanders, ...mainboard.map((card) => card.name)];
    const names = [...new Set(requested.map((name) => name.trim()).filter(Boolean))];
    const resolved = await fetchScryfallCollection(names, signal);
    const cardsByName = new Map();
    for (const card of resolved.cards)
        cardsByName.set(String(card.name).toLocaleLowerCase(), card);
    const commanderCards = commanders.map((name) => cardsByName.get(name.toLocaleLowerCase())).filter(Boolean);
    const identity = new Set(commanderCards.flatMap((card) => card.color_identity ?? []));
    const errors = [];
    const warnings = [];
    const totalCards = commanders.length + mainboard.reduce((sum, card) => sum + card.quantity, 0);
    if (totalCards !== 100)
        errors.push(`Deck contains ${totalCards} cards including commanders; Commander decks require exactly 100.`);
    if (commanderCards.length !== commanders.length)
        errors.push("One or more commanders could not be resolved by exact name.");
    for (const commander of commanderCards)
        validateCommander(commander);
    for (const item of mainboard) {
        const card = cardsByName.get(item.name.toLocaleLowerCase());
        if (!card)
            continue;
        if (card.legalities?.commander !== "legal")
            errors.push(`${card.name} is not Commander-legal.`);
        const outsideIdentity = (card.color_identity ?? []).filter((color) => !identity.has(color));
        if (outsideIdentity.length > 0)
            errors.push(`${card.name} is outside the commander's color identity (${outsideIdentity.join("")}).`);
        const permitsDuplicates = String(card.type_line ?? "").includes("Basic Land")
            || /a deck can have (?:any number|up to)/i.test(String(card.oracle_text ?? ""));
        if (item.quantity > 1 && !permitsDuplicates)
            errors.push(`${card.name} violates singleton with quantity ${item.quantity}.`);
    }
    for (const missing of resolved.notFound)
        errors.push(`Scryfall could not resolve ${missing.name ?? JSON.stringify(missing)}.`);
    const pricedCards = [
        ...commanders.map((name) => ({ name, quantity: 1 })),
        ...mainboard,
    ];
    let estimatedUsd = 0;
    const unpriced = [];
    for (const item of pricedCards) {
        const card = cardsByName.get(item.name.toLocaleLowerCase());
        const price = numericPrice(card?.prices?.usd);
        if (price === null)
            unpriced.push(item.name);
        else
            estimatedUsd += price * item.quantity;
    }
    if (unpriced.length > 0)
        warnings.push(`${unpriced.length} card names lack a USD nonfoil price; the estimate is incomplete.`);
    const landCount = mainboard.reduce((count, item) => {
        const card = cardsByName.get(item.name.toLocaleLowerCase());
        return count + (String(card?.type_line ?? "").includes("Land") ? item.quantity : 0);
    }, 0);
    return {
        valid: errors.length === 0,
        totalCards,
        commanderColorIdentity: [...identity].sort(),
        uniqueNames: names.length,
        landCount,
        estimatedUsd: Number(estimatedUsd.toFixed(2)),
        pricedAt: new Date().toISOString(),
        errors,
        warnings,
        pricingNote: "Estimate uses current Scryfall USD prices for resolved printings, not guaranteed cheapest printings or checkout totals.",
    };
}
function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error("Aborted"));
        }, { once: true });
    });
}
export function commanderWorkshopTools(tool) {
    const budgetTierSchema = Type.Object({
        label: Type.String({ minLength: 1, maxLength: 80 }),
        totalUsd: Type.Number({ exclusiveMinimum: 0, maximum: 10_000 }),
        maxCardUsd: Type.Number({ exclusiveMinimum: 0, maximum: 10_000 }),
    }, { additionalProperties: false });
    return [
        tool({
            name: "magic_commander_random",
            description: "Start Commander Workshop by requesting one random card from Scryfall with exactly `is:commander`. Present the result in the configured #magic channel, then use its rules text and color identity to propose three mechanically defensible concepts: natural synergy, flavor-forward, and offbeat. Include each concept's engine, win plan, weaknesses, and budget pressure. If the result uses Partner, Friends forever, Doctor's companion, Choose a Background, or is a Background, identify the need for a legal paired commander. Do not search for deck cards until the user confirms or revises a concept.",
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_input, config, { signal }) => {
                signal?.throwIfAborted();
                const commander = await fetchRandomScryfallCommander(signal);
                validateCommander(commander);
                return {
                    responseChannel: responseChannel(config),
                    scryfallQuery: "is:commander",
                    commander: compact(commander),
                    nextStep: "Propose exactly three distinct theme concepts and wait for confirmation, revision, or a reroll before searching for deck cards.",
                };
            },
        }),
        tool({
            name: "magic_commander_theme_search",
            description: "After the user confirms or revises a Commander Workshop concept, run several role-specific Scryfall advanced searches constrained to Commander legality and the combined commander color identity, ordered by Scryfall EDHREC rank. Use general Magic knowledge to author precise oracle, type, keyword, and price queries. Then propose the confirmed theme at multiple price points in the configured #magic channel. EDHREC ordering is a popularity aid, not commander-specific synergy evidence.",
            parameters: Type.Object({
                confirmed: Type.Literal(true),
                commanderNames: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1, maxItems: 2, description: "One commander, or both cards for a legal partner/background pairing." }),
                theme: Type.String({ minLength: 10, maxLength: 2_000 }),
                searches: Type.Array(Type.Object({
                    role: Type.String({ minLength: 1, maxLength: 120, description: "Candidate role such as enabler, payoff, draw, interaction, protection, recursion, win condition, or mana." }),
                    query: Type.String({ minLength: 1, maxLength: 1_000, description: "Scryfall advanced-search fragment. Legality and color identity are appended automatically." }),
                }, { additionalProperties: false }), { minItems: 3, maxItems: 12 }),
                budgetTiers: Type.Optional(Type.Array(budgetTierSchema, { minItems: 1, maxItems: 5 })),
                resultsPerSearch: Type.Optional(Type.Integer({ minimum: 5, maximum: 40, default: 25 })),
            }, { additionalProperties: false }),
            execute: async (input, config, { signal }) => {
                signal?.throwIfAborted();
                return {
                    responseChannel: responseChannel(config),
                    ...(await searchTheme(input, signal)),
                };
            },
        }),
        tool({
            name: "magic_commander_deck_validate",
            description: "Deterministically validate and price a proposed Commander Workshop list before presenting it. Call once per budget tier. Checks exact 100-card size, exact-name resolution, Commander legality, color identity, singleton rules, land count, and an indicative Scryfall USD total. Do not describe a list as validated if this tool reports errors.",
            parameters: Type.Object({
                commanders: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1, maxItems: 2 }),
                mainboard: Type.Array(Type.Object({
                    name: Type.String({ minLength: 1, maxLength: 500 }),
                    quantity: Type.Integer({ minimum: 1, maximum: 100 }),
                }, { additionalProperties: false }), { minItems: 1, maxItems: 100 }),
            }, { additionalProperties: false }),
            execute: async ({ commanders, mainboard }, config, { signal }) => {
                signal?.throwIfAborted();
                return {
                    responseChannel: responseChannel(config),
                    ...(await validateDeck(commanders, mainboard, signal)),
                };
            },
        }),
    ];
}
export const commanderWorkshopDefaults = {
    responseChannel: DEFAULT_MAGIC_CHANNEL,
    budgetTiers: defaultBudgetTiers,
    searchOrders: SEARCH_ORDERS,
};
