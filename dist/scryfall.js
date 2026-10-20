import { chmodSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
const UA = "MagicWorkspace/0.1 (+https://github.com/dgliwa/magic-workspace)";
async function getJson(url, signal) { const result = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal, redirect: "error" }); if (!result.ok) {
    let detail = "";
    try {
        detail = String((await result.json()).details ?? "");
    }
    catch { }
    throw new Error(`Scryfall request failed with HTTP ${result.status}${detail ? `: ${detail}` : ""}.`);
} return result.json(); }
export class ScryfallCache {
    path;
    db;
    constructor(path) {
        this.path = path;
        if (path !== ":memory:") {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
            if (existsSync(path) && !lstatSync(path).isFile())
                throw new Error("Scryfall cache must be a regular file.");
        }
        this.db = new DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS scryfall_cards(id TEXT PRIMARY KEY,oracle_id TEXT,name TEXT NOT NULL,normalized_name TEXT NOT NULL,type_line TEXT,oracle_text TEXT,mana_cost TEXT,color_identity TEXT,set_code TEXT,collector_number TEXT,json TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS scryfall_name ON scryfall_cards(normalized_name);CREATE INDEX IF NOT EXISTS scryfall_oracle ON scryfall_cards(oracle_id);CREATE TABLE IF NOT EXISTS cache_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
        if (path !== ":memory:")
            chmodSync(path, 0o600);
    }
    close() { this.db.close(); }
    upsert(card, now = new Date().toISOString()) { this.db.prepare(`INSERT INTO scryfall_cards(id,oracle_id,name,normalized_name,type_line,oracle_text,mana_cost,color_identity,set_code,collector_number,json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET oracle_id=excluded.oracle_id,name=excluded.name,normalized_name=excluded.normalized_name,type_line=excluded.type_line,oracle_text=excluded.oracle_text,mana_cost=excluded.mana_cost,color_identity=excluded.color_identity,set_code=excluded.set_code,collector_number=excluded.collector_number,json=excluded.json,updated_at=excluded.updated_at`).run(String(card.id), card.oracle_id ?? null, String(card.name), String(card.name).toLowerCase(), card.type_line ?? null, card.oracle_text ?? null, card.mana_cost ?? null, JSON.stringify(card.color_identity ?? []), card.set ?? null, card.collector_number ?? null, JSON.stringify(card), now); }
    get(identifier) { const row = this.db.prepare("SELECT json FROM scryfall_cards WHERE id=? OR oracle_id=? OR normalized_name=? ORDER BY CASE WHEN id=? THEN 0 WHEN oracle_id=? THEN 1 ELSE 2 END LIMIT 1").get(identifier, identifier, identifier.toLowerCase(), identifier, identifier); return row ? JSON.parse(String(row.json)) : undefined; }
    search(query, limit = 25) { const q = `%${query.toLowerCase()}%`; return this.db.prepare("SELECT json FROM scryfall_cards WHERE normalized_name LIKE ? OR lower(type_line) LIKE ? OR lower(oracle_text) LIKE ? ORDER BY CASE WHEN normalized_name=? THEN 0 WHEN normalized_name LIKE ? THEN 1 ELSE 2 END,name LIMIT ?").all(q, q, q, query.toLowerCase(), `${query.toLowerCase()}%`, limit).map(r => JSON.parse(String(r.json))); }
    status() { const count = Number(this.db.prepare("SELECT count(*) count FROM scryfall_cards").get().count); const meta = Object.fromEntries(this.db.prepare("SELECT key,value FROM cache_metadata").all().map(r => [String(r.key), String(r.value)])); return { path: this.path, count, ...meta }; }
    async refresh(signal) {
        const catalog = await getJson("https://api.scryfall.com/bulk-data", signal);
        const bulk = (catalog.data ?? []).find((x) => x.type === "oracle_cards");
        const downloadUri = bulk?.jsonl_download_uri ?? bulk?.download_uri;
        if (!downloadUri)
            throw new Error("Scryfall oracle-card bulk data is unavailable.");
        const temp = this.path === ":memory:" ? `/tmp/magic-workspace-oracle-${process.pid}.jsonl.gz` : `${this.path}.oracle-download`;
        const result = await fetch(String(downloadUri), { headers: { "User-Agent": UA, Accept: "application/octet-stream" }, signal, redirect: "error" });
        if (!result.ok || !result.body)
            throw new Error(`Scryfall bulk download failed with HTTP ${result.status}.`);
        let bytes = 0;
        const limiter = new TransformStream({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > 350 * 1024 * 1024)
                throw new Error("Scryfall bulk file exceeded 350 MB."); controller.enqueue(chunk); } });
        await pipeline(Readable.fromWeb(result.body.pipeThrough(limiter)), createWriteStream(temp, { mode: 0o600 }));
        const now = new Date().toISOString(), insert = this.db.prepare(`INSERT INTO scryfall_cards(id,oracle_id,name,normalized_name,type_line,oracle_text,mana_cost,color_identity,set_code,collector_number,json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
        this.db.exec("BEGIN IMMEDIATE;DELETE FROM scryfall_cards;");
        let count = 0;
        try {
            const input = createReadStream(temp);
            const decoded = String(downloadUri).endsWith(".gz") ? input.pipe(createGunzip()) : input;
            const lines = createInterface({ input: decoded, crlfDelay: Infinity });
            for await (const line of lines) {
                if (!line.trim())
                    continue;
                const card = JSON.parse(line);
                insert.run(String(card.id), card.oracle_id ?? null, String(card.name), String(card.name).toLowerCase(), card.type_line ?? null, card.oracle_text ?? null, card.mana_cost ?? null, JSON.stringify(card.color_identity ?? []), card.set ?? null, card.collector_number ?? null, JSON.stringify(card), now);
                count++;
            }
            this.db.prepare("INSERT OR REPLACE INTO cache_metadata(key,value) VALUES('bulk_updated_at',?),('bulk_source_updated_at',?),('bulk_download_uri',?)").run(now, String(bulk.updated_at ?? ""), String(downloadUri));
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        finally {
            rmSync(temp, { force: true });
        }
        return { count, bytes, updatedAt: now, sourceUpdatedAt: bulk.updated_at };
    }
}
export async function fetchScryfallCard(input, signal) { let url; if (input.id)
    url = `https://api.scryfall.com/cards/${encodeURIComponent(input.id)}`;
else if (input.set && input.collectorNumber)
    url = `https://api.scryfall.com/cards/${encodeURIComponent(input.set)}/${encodeURIComponent(input.collectorNumber)}`;
else if (input.name)
    url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(input.name)}`;
else
    throw new Error("Provide name, id, or set plus collectorNumber."); return getJson(url, signal); }
export async function searchScryfall(query, limit = 25, signal) { return searchScryfallAdvanced(query, { limit, unique: "cards", order: "name", direction: "asc" }, signal); }
export async function fetchRandomScryfallCommander(signal) { return getJson("https://api.scryfall.com/cards/random?q=is%3Acommander", signal); }
export async function searchScryfallAdvanced(query, options = {}, signal) { const params = new URLSearchParams({ q: query, unique: options.unique ?? "cards", order: options.order ?? "name", dir: options.direction ?? "auto" }); const payload = await getJson(`https://api.scryfall.com/cards/search?${params.toString()}`, signal); return { totalCards: Number(payload.total_cards ?? 0), cards: (payload.data ?? []).slice(0, options.limit ?? 25), hasMore: Boolean(payload.has_more) }; }
export async function fetchScryfallCollection(names, signal) { const cards = []; const notFound = []; for (let offset = 0; offset < names.length; offset += 75) {
    if (offset > 0)
        await new Promise(resolve => setTimeout(resolve, 100));
    const identifiers = names.slice(offset, offset + 75).map(name => ({ name }));
    const response = await fetch("https://api.scryfall.com/cards/collection", { method: "POST", headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ identifiers }), signal, redirect: "error" });
    if (!response.ok) {
        let detail = "";
        try {
            detail = String((await response.json()).details ?? "");
        }
        catch { }
        throw new Error(`Scryfall collection request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
    const payload = await response.json();
    cards.push(...(payload.data ?? []));
    notFound.push(...(payload.not_found ?? []));
} return { cards, notFound }; }
export async function fetchScryfallRulings(id, signal) { const payload = await getJson(`https://api.scryfall.com/cards/${encodeURIComponent(id)}/rulings`, signal); return payload.data ?? []; }
