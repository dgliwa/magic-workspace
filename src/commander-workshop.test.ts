import { afterEach, describe, expect, it, vi } from "vitest";
import { commanderWorkshopTools } from "./commander-workshop.js";

const tool = (definition: any) => definition;
const commander = {
  id: "commander-id",
  oracle_id: "commander-oracle",
  name: "Test Commander",
  type_line: "Legendary Creature — Wizard",
  oracle_text: "Whenever you cast a spell, draw a card.",
  color_identity: ["U", "R"],
  legalities: { commander: "legal" },
  prices: { usd: "1.25" },
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.restoreAllMocks());

describe("Commander Workshop", () => {
  it("requests a random card using exactly is:commander and defaults to #magic", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(commander));
    const random = commanderWorkshopTools(tool).find((candidate: any) => candidate.name === "magic_commander_random");
    const result = await random.execute({}, {}, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.scryfall.com/cards/random?q=is%3Acommander");
    expect(result).toMatchObject({
      responseChannel: "channel:1560498017394499706",
      scryfallQuery: "is:commander",
      commander: { name: "Test Commander" },
    });
  });

  it("constrains confirmed theme searches and orders candidates by EDHREC", async () => {
    const candidate = {
      id: "candidate-id",
      oracle_id: "candidate-oracle",
      name: "Theme Payoff",
      type_line: "Enchantment",
      oracle_text: "Whenever you cast a spell, create a token.",
      color_identity: ["U"],
      legalities: { commander: "legal" },
      edhrec_rank: 42,
      prices: { usd: "2.00" },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(commander))
      .mockImplementation(async () => jsonResponse({ total_cards: 1, has_more: false, data: [candidate] }));
    const search = commanderWorkshopTools(tool).find((toolDefinition: any) => toolDefinition.name === "magic_commander_theme_search");
    const result = await search.execute({
      confirmed: true,
      commanderName: "Test Commander",
      theme: "Cast spells to produce an unusual army of tokens.",
      searches: [
        { role: "enablers", query: "o:\"cast a spell\"" },
        { role: "payoffs", query: "o:\"create a token\"" },
        { role: "interaction", query: "t:instant o:counter" },
      ],
      resultsPerSearch: 10,
    }, {}, {});

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const searchUrls = fetchMock.mock.calls.slice(1).map((call) => new URL(String(call[0])));
    for (const url of searchUrls) {
      expect(url.searchParams.get("q")).toContain("legal:commander id<=ur");
      expect(url.searchParams.get("order")).toBe("edhrec");
    }
    expect(result).toMatchObject({
      responseChannel: "channel:1560498017394499706",
      commander: { name: "Test Commander" },
      theme: "Cast spells to produce an unusual army of tokens.",
      candidates: [{ name: "Theme Payoff", eligibleBudgetTiers: ["budget", "established", "premium-casual"] }],
    });
  });

  it("validates deck size, color identity, singleton rules, and price", async () => {
    const island = {
      id: "island-id",
      oracle_id: "island-oracle",
      name: "Island",
      type_line: "Basic Land — Island",
      oracle_text: "({T}: Add {U}.)",
      color_identity: ["U"],
      legalities: { commander: "legal" },
      prices: { usd: "0.10" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: [commander, island], not_found: [] }));
    const validate = commanderWorkshopTools(tool).find((candidate: any) => candidate.name === "magic_commander_deck_validate");
    const result = await validate.execute({
      commanders: ["Test Commander"],
      mainboard: [{ name: "Island", quantity: 99 }],
    }, {}, {});

    expect(result).toMatchObject({
      valid: true,
      totalCards: 100,
      commanderColorIdentity: ["R", "U"],
      landCount: 99,
      estimatedUsd: 11.15,
      errors: [],
    });
  });
});
