import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectMagicProxy } from "./proxy-publication.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "magic-proxy-"));
  const record = join(root, "sol-ring-sunburst");
  await mkdir(record);
  await writeFile(join(record, "art.png"), "proxy");
  await writeFile(join(record, "proxy.json"), JSON.stringify({
    cardName: "Sol Ring",
    occurredAt: "2026-10-29T12:00:00-05:00",
    artwork: { file: "art.png", alt: "A sunburst alternate artwork for Sol Ring.", caption: "Sunburst study" },
    notes: "Painted after coffee.",
    tags: ["artifact"],
  }));
  return { root, record };
}

const card = {
  id: "scryfall-id",
  name: "Sol Ring",
  scryfall_uri: "https://scryfall.com/card/cmm/396/sol-ring",
  image_uris: { large: "https://cards.scryfall.io/large/front/a/b/ab.jpg" },
};

describe("magic proxy publication projection", () => {
  it("projects local artwork with authoritative Scryfall comparison metadata", async () => {
    const { root } = await fixture();
    const result = await projectMagicProxy(root, "sol-ring-sunburst", async () => card);
    expect(result).toMatchObject({
      source: { system: "magic-proxy", recordId: "sol-ring-sunburst" },
      fields: {
        title: "Sol Ring — alternate art",
        cardName: "Sol Ring",
        scryfallUrl: card.scryfall_uri,
        originalImageUrl: card.image_uris.large,
        notes: "Painted after coffee.",
        tags: ["magic-proxy", "magic-the-gathering", "artifact"],
      },
      media: [{ id: "proxy-artwork", mimeType: "image/png", altHint: "A sunburst alternate artwork for Sol Ring." }],
    });
  });

  it("refuses artwork that escapes the record through a symlink", async () => {
    const { root, record } = await fixture();
    const outside = join(root, "outside.png");
    await writeFile(outside, "private");
    await symlink(outside, join(record, "escape.png"));
    await writeFile(join(record, "proxy.json"), JSON.stringify({
      cardName: "Sol Ring",
      occurredAt: "2026-10-29T12:00:00Z",
      artwork: { file: "escape.png", alt: "Escaped file." },
    }));
    await expect(projectMagicProxy(root, "sol-ring-sunburst", async () => card)).rejects.toThrow(/inside/);
  });
});
