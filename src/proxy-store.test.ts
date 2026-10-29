import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ProxyStore } from "./proxy-store.js";

const card = {
  id: "card-id",
  name: "Sol Ring",
  scryfall_uri: "https://scryfall.com/card/cmm/396/sol-ring",
  image_uris: { large: "https://cards.scryfall.io/large/front/a/b/card.jpg" },
};

async function sourceImage(root: string): Promise<string> {
  const path = join(root, "upload.png");
  await sharp({ create: { width: 80, height: 120, channels: 4, background: "#c43c35" } }).png().withMetadata({ orientation: 6 }).toFile(path);
  return path;
}

describe("ProxyStore", () => {
  it("sanitizes artwork and stores resolved Scryfall metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "proxy-store-"));
    const store = new ProxyStore(join(root, "records"), async () => card);
    const created = await store.create({
      sourcePath: await sourceImage(root),
      cardName: "sol ring",
      alt: "Red and gold geometric Sol Ring artwork.",
      occurredAt: "2026-10-29T12:00:00Z",
      tags: ["Artifact Study"],
    });
    expect(created).toMatchObject({ id: "sol-ring-20261029", cardName: "Sol Ring", scryfallId: "card-id", status: "active" });
    expect(created.tags).toEqual(["artifact-study"]);
    const artwork = await sharp(join(root, "records", created.id, "artwork.webp")).metadata();
    expect(artwork.format).toBe("webp");
    expect(artwork.orientation).toBeUndefined();
    expect(JSON.parse(await readFile(join(root, "records", created.id, "proxy.json"), "utf8"))).not.toHaveProperty("sourcePath");
  });

  it("lists, updates, and archives records without deleting them", async () => {
    const root = await mkdtemp(join(tmpdir(), "proxy-store-"));
    const store = new ProxyStore(join(root, "records"), async () => card);
    const created = await store.create({ sourcePath: await sourceImage(root), cardName: "Sol Ring", alt: "A detailed alternate Sol Ring illustration." });
    expect(await store.list()).toHaveLength(1);
    const updated = await store.update(created.id, { notes: "Ink and watercolor.", alt: "An ink and watercolor Sol Ring illustration." });
    expect(updated.notes).toBe("Ink and watercolor.");
    await store.archive(created.id);
    expect(await store.list()).toHaveLength(0);
    expect(await store.list(true)).toHaveLength(1);
    expect((await store.get(created.id)).artworkPath).toMatch(/artwork\.webp$/);
  });

  it("rejects unreadable uploads without leaving a record", async () => {
    const root = await mkdtemp(join(tmpdir(), "proxy-store-"));
    const invalid = join(root, "bad.png");
    await writeFile(invalid, "not an image");
    const store = new ProxyStore(join(root, "records"), async () => card);
    await expect(store.create({ sourcePath: invalid, cardName: "Sol Ring", alt: "Invalid alternate artwork upload." })).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });
});
