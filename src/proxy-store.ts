import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import sharp from "sharp";
import { fetchScryfallCard } from "./scryfall.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PIXELS = 40_000_000;
const MAX_BYTES = 50 * 1024 * 1024;

export interface StoredProxy {
  id: string;
  cardName: string;
  scryfallId: string;
  scryfallUrl: string;
  originalImageUrl: string;
  occurredAt: string;
  artwork: { file: "artwork.webp"; alt: string; caption?: string; sha256: string; width: number; height: number };
  title?: string;
  summary?: string;
  notes?: string;
  tags: string[];
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CreateProxyInput {
  sourcePath: string;
  cardName: string;
  alt: string;
  caption?: string;
  occurredAt?: string;
  title?: string;
  summary?: string;
  notes?: string;
  tags?: string[];
  id?: string;
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "proxy";
}

function originalImage(card: any): string {
  const value = card.image_uris?.large ?? card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.normal;
  if (typeof value !== "string") throw new Error(`Scryfall has no display image for ${String(card.name ?? "the card")}.`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "cards.scryfall.io") throw new Error("Scryfall returned an unexpected image host.");
  return url.toString();
}

function publicCardUrl(card: any): string {
  const url = new URL(String(card.scryfall_uri ?? ""));
  if (url.protocol !== "https:" || url.hostname !== "scryfall.com") throw new Error("Scryfall returned an unexpected card URL.");
  return url.toString();
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

export function resolveProxyRoot(stateDir: string, configured?: string): string {
  const state = resolve(stateDir);
  if (!configured) return join(state, "plugins", "magic-workspace", "proxies");
  const target = resolve(configured.replace(/^~(?=\/)/, process.env.HOME ?? ""));
  if (!isAbsolute(configured)) {
    const rel = relative(state, resolve(state, configured));
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Relative proxy root must remain inside OpenClaw state.");
    return resolve(state, configured);
  }
  return target;
}

export class ProxyStore {
  constructor(private readonly root: string, private readonly resolveCard: (name: string) => Promise<any> = (name) => fetchScryfallCard({ name })) {}

  private recordRoot(id: string): string {
    if (!ID_PATTERN.test(id)) throw new Error("Proxy id must be lowercase kebab-case.");
    return join(this.root, id);
  }

  async create(input: CreateProxyInput): Promise<StoredProxy> {
    if (!input.cardName.trim()) throw new Error("cardName is required.");
    if (input.alt.trim().length < 8) throw new Error("alt must describe the artwork in at least 8 characters.");
    const sourcePath = resolve(input.sourcePath);
    if (!(await lstat(sourcePath)).isFile()) throw new Error("sourcePath must name a regular image file.");
    const card = await this.resolveCard(input.cardName.trim());
    if (!card || typeof card.id !== "string" || typeof card.name !== "string") throw new Error(`Scryfall could not resolve ${input.cardName}.`);
    const occurredAt = new Date(input.occurredAt ?? Date.now());
    if (!Number.isFinite(occurredAt.getTime())) throw new Error("occurredAt must be a valid date.");
    const id = input.id ?? `${slug(card.name)}-${occurredAt.toISOString().slice(0, 10).replaceAll("-", "")}`;
    const recordRoot = this.recordRoot(id);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(recordRoot, { recursive: false, mode: 0o700 });
    const artworkPath = join(recordRoot, "artwork.webp");
    try {
      const image = sharp(sourcePath, { limitInputPixels: MAX_PIXELS }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) throw new Error("Artwork has no readable dimensions.");
      await image.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 92 }).toFile(artworkPath);
      const bytes = await readFile(artworkPath);
      if (bytes.length > MAX_BYTES) throw new Error("Sanitized artwork exceeds 50 MB.");
      const output = await sharp(bytes).metadata();
      if (!output.width || !output.height) throw new Error("Sanitized artwork has no readable dimensions.");
      const now = new Date().toISOString();
      const stored: StoredProxy = {
        id,
        cardName: card.name,
        scryfallId: card.id,
        scryfallUrl: publicCardUrl(card),
        originalImageUrl: originalImage(card),
        occurredAt: occurredAt.toISOString(),
        artwork: {
          file: "artwork.webp",
          alt: input.alt.trim(),
          ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          width: output.width,
          height: output.height,
        },
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        tags: [...new Set((input.tags ?? []).map(slug).filter(Boolean))],
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      await atomicJson(join(recordRoot, "proxy.json"), stored);
      return stored;
    } catch (error) {
      const { rm } = await import("node:fs/promises");
      await rm(recordRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async get(id: string): Promise<StoredProxy & { artworkPath: string }> {
    const recordRoot = this.recordRoot(id);
    let proxy: StoredProxy;
    try {
      proxy = JSON.parse(await readFile(join(recordRoot, "proxy.json"), "utf8")) as StoredProxy;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Unknown magic proxy: ${id}`);
      throw error;
    }
    return { ...proxy, artworkPath: join(recordRoot, proxy.artwork.file) };
  }

  async list(includeArchived = false): Promise<StoredProxy[]> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.root, { withFileTypes: true });
    const proxies: StoredProxy[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
      try {
        const { artworkPath: _, ...proxy } = await this.get(entry.name);
        if (includeArchived || proxy.status !== "archived") proxies.push(proxy);
      } catch {}
    }
    return proxies.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async update(id: string, patch: Partial<Pick<CreateProxyInput, "alt" | "caption" | "title" | "summary" | "notes" | "tags">> & { sourcePath?: string }): Promise<StoredProxy> {
    const current = await this.get(id);
    let artwork = current.artwork;
    if (patch.sourcePath) {
      const replacement = await this.create({
        sourcePath: patch.sourcePath,
        cardName: current.cardName,
        alt: patch.alt ?? current.artwork.alt,
        caption: patch.caption ?? current.artwork.caption,
        occurredAt: current.occurredAt,
        id: `${id}-replacement-${Date.now()}`,
      });
      const replacementRoot = this.recordRoot(replacement.id);
      const bytes = await readFile(join(replacementRoot, replacement.artwork.file));
      await writeFile(join(this.recordRoot(id), "artwork.webp"), bytes, { mode: 0o600 });
      artwork = { ...replacement.artwork, alt: patch.alt?.trim() || current.artwork.alt, ...(patch.caption !== undefined ? (patch.caption.trim() ? { caption: patch.caption.trim() } : { caption: undefined }) : {}) };
      const { rm } = await import("node:fs/promises");
      await rm(replacementRoot, { recursive: true, force: true });
    } else {
      artwork = {
        ...artwork,
        ...(patch.alt !== undefined ? { alt: patch.alt.trim() } : {}),
        ...(patch.caption !== undefined ? (patch.caption.trim() ? { caption: patch.caption.trim() } : { caption: undefined }) : {}),
      };
    }
    const updated: StoredProxy = {
      ...current,
      artwork,
      ...(patch.title !== undefined ? (patch.title.trim() ? { title: patch.title.trim() } : { title: undefined }) : {}),
      ...(patch.summary !== undefined ? (patch.summary.trim() ? { summary: patch.summary.trim() } : { summary: undefined }) : {}),
      ...(patch.notes !== undefined ? (patch.notes.trim() ? { notes: patch.notes.trim() } : { notes: undefined }) : {}),
      ...(patch.tags !== undefined ? { tags: [...new Set(patch.tags.map(slug).filter(Boolean))] } : {}),
      updatedAt: new Date().toISOString(),
    };
    delete (updated as any).artworkPath;
    await atomicJson(join(this.recordRoot(id), "proxy.json"), updated);
    return updated;
  }

  async archive(id: string): Promise<StoredProxy> {
    const current = await this.get(id);
    const updated: StoredProxy = { ...current, status: "archived", updatedAt: new Date().toISOString() };
    delete (updated as any).artworkPath;
    await atomicJson(join(this.recordRoot(id), "proxy.json"), updated);
    return updated;
  }
}
