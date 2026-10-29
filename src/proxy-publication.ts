import { lstat, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fetchScryfallCard } from "./scryfall.js";

const RECORD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIME_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface ProxyManifest {
  cardName: string;
  occurredAt: string;
  artwork: {
    file: string;
    alt: string;
    caption?: string;
  };
  title?: string;
  summary?: string;
  notes?: string;
  tags?: string[];
  status?: "active" | "archived";
  scryfallId?: string;
  scryfallUrl?: string;
  originalImageUrl?: string;
}

export interface ProxyPublicationProjection {
  projectionVersion: 1;
  source: { system: "magic-proxy"; recordId: string; version: string };
  occurredAt: string;
  fields: {
    title: string;
    summary: string;
    cardName: string;
    scryfallUrl: string;
    originalImageUrl: string;
    notes?: string;
    tags: string[];
  };
  optInFields: Record<string, never>;
  media: Array<{
    id: "proxy-artwork";
    path: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    altHint: string;
    caption?: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(raw: unknown): ProxyManifest {
  if (!isRecord(raw) || typeof raw.cardName !== "string" || !raw.cardName.trim()) throw new Error("proxy.json requires cardName.");
  if (typeof raw.occurredAt !== "string" || !Number.isFinite(Date.parse(raw.occurredAt))) throw new Error("proxy.json requires a valid occurredAt date.");
  if (!isRecord(raw.artwork) || typeof raw.artwork.file !== "string" || !raw.artwork.file.trim()) throw new Error("proxy.json requires artwork.file.");
  if (typeof raw.artwork.alt !== "string" || !raw.artwork.alt.trim()) throw new Error("proxy.json requires artwork.alt.");
  if (raw.artwork.caption !== undefined && typeof raw.artwork.caption !== "string") throw new Error("artwork.caption must be a string.");
  for (const field of ["title", "summary", "notes", "scryfallId", "scryfallUrl", "originalImageUrl"] as const) {
    if (raw[field] !== undefined && typeof raw[field] !== "string") throw new Error(`${field} must be a string.`);
  }
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== "string"))) throw new Error("tags must be strings.");
  return raw as unknown as ProxyManifest;
}

async function fileInside(root: string, child: string): Promise<string> {
  if (isAbsolute(child)) throw new Error("Artwork path must be relative to its proxy record.");
  const realRoot = await realpath(root);
  const candidate = await realpath(resolve(root, child));
  const rel = relative(realRoot, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Artwork must resolve inside its proxy record.");
  if (!(await lstat(candidate)).isFile()) throw new Error("Proxy artwork must be a regular file.");
  return candidate;
}

function cardImageUrl(card: any): string {
  const value = card.image_uris?.large ?? card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.large ?? card.card_faces?.[0]?.image_uris?.normal;
  if (typeof value !== "string") throw new Error(`Scryfall has no display image for ${String(card.name ?? "the card")}.`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "cards.scryfall.io") throw new Error("Scryfall returned an unexpected image host.");
  return url.toString();
}

export async function projectMagicProxy(
  root: string,
  recordId: string,
  resolveCard: (name: string) => Promise<any> = (name) => fetchScryfallCard({ name }),
): Promise<ProxyPublicationProjection> {
  if (!RECORD_ID.test(recordId)) throw new Error("Proxy record id must be lowercase kebab-case.");
  const recordRoot = resolve(root, recordId);
  let manifest: ProxyManifest;
  try {
    manifest = parseManifest(JSON.parse(await readFile(resolve(recordRoot, "proxy.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Magic proxy ${recordId} was not found.`);
    throw error;
  }
  if (manifest.status === "archived") throw new Error(`Magic proxy ${recordId} is archived.`);
  const artworkPath = await fileInside(recordRoot, manifest.artwork.file);
  const mimeType = MIME_TYPES[extname(artworkPath).toLowerCase()];
  if (!mimeType) throw new Error("Proxy artwork must be JPEG, PNG, or WebP.");
  const card = manifest.scryfallUrl && manifest.originalImageUrl
    ? { name: manifest.cardName.trim(), scryfall_uri: manifest.scryfallUrl, image_uris: { large: manifest.originalImageUrl } }
    : await resolveCard(manifest.cardName.trim());
  if (!card || typeof card.name !== "string" || typeof card.scryfall_uri !== "string") throw new Error(`Scryfall could not resolve ${manifest.cardName}.`);
  const scryfallUrl = new URL(card.scryfall_uri);
  if (scryfallUrl.protocol !== "https:" || scryfallUrl.hostname !== "scryfall.com") throw new Error("Scryfall returned an unexpected card URL.");
  const version = (await lstat(resolve(recordRoot, "proxy.json"))).mtime.toISOString();
  return {
    projectionVersion: 1,
    source: { system: "magic-proxy", recordId, version },
    occurredAt: new Date(manifest.occurredAt).toISOString(),
    fields: {
      title: manifest.title?.trim() || `${card.name} — alternate art`,
      summary: manifest.summary?.trim() || `An alternate-art proxy for ${card.name}.`,
      cardName: card.name,
      scryfallUrl: scryfallUrl.toString(),
      originalImageUrl: cardImageUrl(card),
      ...(manifest.notes?.trim() ? { notes: manifest.notes.trim() } : {}),
      tags: [...new Set(["magic-proxy", "magic-the-gathering", ...(manifest.tags ?? [])])],
    },
    optInFields: {},
    media: [{
      id: "proxy-artwork",
      path: artworkPath,
      mimeType,
      altHint: manifest.artwork.alt.trim(),
      ...(manifest.artwork.caption?.trim() ? { caption: manifest.artwork.caption.trim() } : {}),
    }],
  };
}
