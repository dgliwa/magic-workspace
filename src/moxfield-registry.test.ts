import { describe, expect, it } from "vitest";
import { normalizeDiscoveredDecks } from "./moxfield-account.js";
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
  it("stores discovery, normalized snapshots, tags, and archives missing decks", () => {
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

      expect(registry.status()).toMatchObject({ activeDecks: 1, cachedDecks: 1, untaggedActiveDecks: 1 });
      expect(registry.get(deck.publicId)).toMatchObject({ name: "Deck One", tags: [], cards: [{ name: "Commander" }, { name: "Sol Ring" }] });
      expect(registry.addTag(deck.publicId, "Built")).toEqual({ publicId: deck.publicId, tags: ["built"] });
      expect(registry.addTag(deck.publicId, "precon")).toEqual({ publicId: deck.publicId, tags: ["built", "precon"] });
      expect(registry.list({ tag: "BUILT" })).toHaveLength(1);
      expect(registry.tagSummary()).toEqual({ tags: [{ tag: "built", deckCount: 1 }, { tag: "precon", deckCount: 1 }], untaggedActiveDecks: 0 });
      expect(registry.removeTag(deck.publicId, "precon")).toEqual({ publicId: deck.publicId, tags: ["built"] });
      expect(registry.setTags(deck.publicId, ["testing", "Built", "built"])).toEqual({ publicId: deck.publicId, tags: ["built", "testing"] });

      registry.importDiscovery({ userName: "tester" }, [], "2026-02-01T00:00:00.000Z");
      expect(registry.list()).toEqual([]);
      expect(registry.list({ includeArchived: true })[0]).toMatchObject({ publicId: deck.publicId, tags: ["built", "testing"], archivedAt: "2026-02-01T00:00:00.000Z" });
    } finally {
      registry.close();
    }
  });

  it("rejects invalid tags and unknown decks", () => {
    const registry = new MoxfieldRegistry(":memory:");
    try {
      expect(() => registry.addTag("missing", "built")).toThrow(/Unknown Moxfield deck/);
      registry.importDiscovery({}, [deck]);
      expect(() => registry.addTag(deck.publicId, "not a tag")).toThrow(/Tags must/);
    } finally {
      registry.close();
    }
  });
});

describe("Moxfield authenticated discovery", () => {
  it("normalizes authenticated account deck list", () => {
    expect(normalizeDiscoveredDecks({
      decks: [{
        ...deck,
        id: deck.internalId,
        lastUpdatedAtUtc: "2026-01-01T00:00:00.000Z",
      }],
    })).toEqual([{ ...deck, updatedAt: "2026-01-01T00:00:00.000Z" }]);
  });
});
