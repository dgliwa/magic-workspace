import { describe, expect, it, vi } from "vitest";
import { discoverMoxfieldDecks, exchangeSessionCookie } from "./moxfield-account.js";
import { MoxfieldRegistry } from "./moxfield-registry.js";

const deck = {
  publicId: "deck_one",
  internalId: "internal-1",
  name: "Deck One",
  format: "commander",
  visibility: "public",
  publicUrl: "https://moxfield.com/decks/deck_one",
};

describe("MoxfieldRegistry", () => {
  it("stores discovery, normalized snapshots, and archives missing decks", () => {
    const registry = new MoxfieldRegistry(":memory:");
    try {
      registry.importDiscovery({
        userName: "tester",
        collectionPublicId: "collection_one",
        collectionUrl: "https://moxfield.com/collection/collection_one",
      }, [deck], "2026-01-01T00:00:00.000Z");
      registry.saveSnapshot({
        publicId: deck.publicId,
        internalId: deck.internalId,
        name: deck.name,
        format: deck.format,
        url: deck.publicUrl,
        source: "moxfield",
        cards: [
          { name: "Commander", quantity: 1, board: "commanders" },
          { name: "Sol Ring", quantity: 1, board: "mainboard", scryfallId: "scryfall-1" },
        ],
      });

      expect(registry.status()).toMatchObject({ activeDecks: 1, cachedDecks: 1 });
      expect(registry.get(deck.publicId)).toMatchObject({ name: "Deck One", cards: [{ name: "Commander" }, { name: "Sol Ring" }] });

      registry.importDiscovery({ userName: "tester" }, [], "2026-02-01T00:00:00.000Z");
      expect(registry.list()).toEqual([]);
      expect(registry.list({ includeArchived: true })[0]).toMatchObject({ publicId: deck.publicId, archivedAt: "2026-02-01T00:00:00.000Z" });
    } finally {
      registry.close();
    }
  });
});

describe("Moxfield authenticated discovery", () => {
  it("exchanges a cookie without persisting it and normalizes the deck list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ refresh: {
        access_token: "short-lived-token",
        user_name: "tester",
        user_id: "user-1",
        collectionPublicId: "collection_one",
      } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ decks: [{ ...deck, id: deck.internalId, lastUpdatedAtUtc: "2026-01-01T00:00:00.000Z" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      const exchanged = await exchangeSessionCookie("session=secret");
      expect(exchanged.account.collectionUrl).toBe("https://moxfield.com/collection/collection_one");
      expect(await discoverMoxfieldDecks(exchanged.token)).toEqual([{ ...deck, updatedAt: "2026-01-01T00:00:00.000Z" }]);
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Cookie: "session=secret" });
      expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer short-lived-token" });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
