import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
export class MoxfieldRegistry {
    path;
    db;
    constructor(path) {
        this.path = path;
        if (path !== ":memory:") {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
            if (existsSync(path) && !lstatSync(path).isFile())
                throw new Error("Magic Workspace database must be a regular file.");
        }
        this.db = new DatabaseSync(path);
        this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS moxfield_account (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        user_name TEXT,
        user_id TEXT,
        collection_public_id TEXT,
        collection_url TEXT,
        discovered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS moxfield_decks (
        public_id TEXT PRIMARY KEY,
        internal_id TEXT,
        name TEXT NOT NULL,
        format TEXT,
        visibility TEXT,
        public_url TEXT NOT NULL UNIQUE,
        remote_updated_at TEXT,
        first_discovered_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        archived_at TEXT,
        snapshot_refreshed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS moxfield_decks_active ON moxfield_decks(archived_at,name);
      CREATE TABLE IF NOT EXISTS moxfield_deck_cards (
        public_id TEXT NOT NULL REFERENCES moxfield_decks(public_id) ON DELETE CASCADE,
        board TEXT NOT NULL,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        scryfall_id TEXT,
        moxfield_card_id TEXT,
        set_code TEXT,
        collector_number TEXT,
        PRIMARY KEY(public_id,board,position)
      );
      CREATE INDEX IF NOT EXISTS moxfield_deck_cards_name ON moxfield_deck_cards(name,public_id);
      CREATE TABLE IF NOT EXISTS moxfield_deck_tags (
        public_id TEXT NOT NULL REFERENCES moxfield_decks(public_id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(public_id,tag)
      );
      CREATE INDEX IF NOT EXISTS moxfield_deck_tags_tag ON moxfield_deck_tags(tag,public_id);
    `);
        if (path !== ":memory:")
            chmodSync(path, 0o600);
    }
    close() {
        this.db.close();
    }
    importDiscovery(account, decks, now = new Date().toISOString()) {
        const ids = new Set();
        for (const deck of decks) {
            if (!/^[A-Za-z0-9_-]+$/.test(deck.publicId))
                throw new Error(`Invalid Moxfield public ID: ${deck.publicId}`);
            if (ids.has(deck.publicId))
                throw new Error(`Duplicate Moxfield public ID: ${deck.publicId}`);
            ids.add(deck.publicId);
        }
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare(`
        INSERT INTO moxfield_account(singleton,user_name,user_id,collection_public_id,collection_url,discovered_at)
        VALUES(1,?,?,?,?,?)
        ON CONFLICT(singleton) DO UPDATE SET
          user_name=excluded.user_name,
          user_id=excluded.user_id,
          collection_public_id=excluded.collection_public_id,
          collection_url=excluded.collection_url,
          discovered_at=excluded.discovered_at
      `).run(account.userName ?? null, account.userId ?? null, account.collectionPublicId ?? null, account.collectionUrl ?? null, now);
            this.db.prepare("UPDATE moxfield_decks SET archived_at=? WHERE archived_at IS NULL").run(now);
            const upsert = this.db.prepare(`
        INSERT INTO moxfield_decks(
          public_id,internal_id,name,format,visibility,public_url,remote_updated_at,
          first_discovered_at,last_seen_at,archived_at
        ) VALUES(?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(public_id) DO UPDATE SET
          internal_id=excluded.internal_id,
          name=excluded.name,
          format=excluded.format,
          visibility=excluded.visibility,
          public_url=excluded.public_url,
          remote_updated_at=excluded.remote_updated_at,
          last_seen_at=excluded.last_seen_at,
          archived_at=NULL
      `);
            for (const deck of decks) {
                upsert.run(deck.publicId, deck.internalId ?? null, deck.name, deck.format ?? null, deck.visibility ?? null, deck.publicUrl, deck.updatedAt ?? null, now, now);
            }
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.status();
    }
    saveSnapshot(snapshot, now = new Date().toISOString()) {
        if (!snapshot.publicId)
            throw new Error("Moxfield snapshot is missing publicId.");
        const existing = this.db.prepare("SELECT public_id FROM moxfield_decks WHERE public_id=?").get(snapshot.publicId);
        if (!existing)
            throw new Error(`Unknown discovered Moxfield deck: ${snapshot.publicId}`);
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare("DELETE FROM moxfield_deck_cards WHERE public_id=?").run(snapshot.publicId);
            const insert = this.db.prepare(`
        INSERT INTO moxfield_deck_cards(
          public_id,board,position,name,quantity,scryfall_id,moxfield_card_id,set_code,collector_number
        ) VALUES(?,?,?,?,?,?,?,?,?)
      `);
            snapshot.cards.forEach((card, position) => {
                insert.run(snapshot.publicId, card.board, position, card.name, card.quantity, card.scryfallId ?? null, card.moxfieldCardId ?? null, card.set ?? null, card.collectorNumber ?? null);
            });
            this.db.prepare(`
        UPDATE moxfield_decks SET
          internal_id=COALESCE(?,internal_id),
          name=?,format=COALESCE(?,format),public_url=COALESCE(?,public_url),
          remote_updated_at=COALESCE(?,remote_updated_at),snapshot_refreshed_at=?
        WHERE public_id=?
      `).run(snapshot.internalId ?? null, snapshot.name, snapshot.format ?? null, snapshot.url ?? null, snapshot.updatedAt ?? null, now, snapshot.publicId);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    list(options = {}) {
        const where = [];
        const values = [];
        if (!options.includeArchived)
            where.push("d.archived_at IS NULL");
        if (options.query) {
            where.push("(lower(d.name) LIKE ? OR lower(COALESCE(d.format,'')) LIKE ? OR lower(d.public_id) LIKE ?)");
            const query = `%${options.query.toLowerCase()}%`;
            values.push(query, query, query);
        }
        if (options.tag) {
            where.push("EXISTS(SELECT 1 FROM moxfield_deck_tags filter_tags WHERE filter_tags.public_id=d.public_id AND filter_tags.tag=?)");
            values.push(normalizeTag(options.tag));
        }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        return this.db.prepare(`
      SELECT d.*,COALESCE(SUM(c.quantity),0) AS card_count,COUNT(c.position) AS unique_cards
      FROM moxfield_decks d
      LEFT JOIN moxfield_deck_cards c ON c.public_id=d.public_id
      ${clause}
      GROUP BY d.public_id
      ORDER BY d.archived_at IS NOT NULL,d.name COLLATE NOCASE
    `).all(...values).map(row => ({ ...mapDeckRow(row), tags: this.tags(String(row.public_id)) }));
    }
    get(publicId) {
        const row = this.db.prepare("SELECT * FROM moxfield_decks WHERE public_id=?").get(publicId);
        if (!row)
            throw new Error(`Unknown Moxfield deck: ${publicId}`);
        const cards = this.db.prepare(`
      SELECT board,name,quantity,scryfall_id,moxfield_card_id,set_code,collector_number
      FROM moxfield_deck_cards WHERE public_id=?
      ORDER BY CASE board WHEN 'commanders' THEN 0 WHEN 'mainboard' THEN 1 WHEN 'sideboard' THEN 2 WHEN 'maybeboard' THEN 3 ELSE 4 END,position
    `).all(publicId).map(card => ({
            board: String(card.board),
            name: String(card.name),
            quantity: Number(card.quantity),
            scryfallId: card.scryfall_id ? String(card.scryfall_id) : undefined,
            moxfieldCardId: card.moxfield_card_id ? String(card.moxfield_card_id) : undefined,
            set: card.set_code ? String(card.set_code) : undefined,
            collectorNumber: card.collector_number ? String(card.collector_number) : undefined,
        }));
        return {
            publicId: String(row.public_id),
            internalId: row.internal_id ? String(row.internal_id) : undefined,
            name: String(row.name),
            format: row.format ? String(row.format) : undefined,
            url: String(row.public_url),
            updatedAt: row.remote_updated_at ? String(row.remote_updated_at) : undefined,
            source: "moxfield",
            cards,
            visibility: row.visibility ? String(row.visibility) : undefined,
            archivedAt: row.archived_at ? String(row.archived_at) : undefined,
            tags: this.tags(publicId),
        };
    }
    setTags(publicId, tags, now = new Date().toISOString()) {
        this.assertDeck(publicId);
        const normalized = [...new Set(tags.map(normalizeTag))].sort();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare("DELETE FROM moxfield_deck_tags WHERE public_id=?").run(publicId);
            const insert = this.db.prepare("INSERT INTO moxfield_deck_tags(public_id,tag,created_at) VALUES(?,?,?)");
            for (const tag of normalized)
                insert.run(publicId, tag, now);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return { publicId, tags: normalized };
    }
    addTag(publicId, tag, now = new Date().toISOString()) {
        this.assertDeck(publicId);
        const normalized = normalizeTag(tag);
        this.db.prepare("INSERT OR IGNORE INTO moxfield_deck_tags(public_id,tag,created_at) VALUES(?,?,?)").run(publicId, normalized, now);
        return { publicId, tags: this.tags(publicId) };
    }
    removeTag(publicId, tag) {
        this.assertDeck(publicId);
        const normalized = normalizeTag(tag);
        this.db.prepare("DELETE FROM moxfield_deck_tags WHERE public_id=? AND tag=?").run(publicId, normalized);
        return { publicId, tags: this.tags(publicId) };
    }
    tags(publicId) {
        return this.db.prepare("SELECT tag FROM moxfield_deck_tags WHERE public_id=? ORDER BY tag").all(publicId).map(row => String(row.tag));
    }
    tagSummary() {
        return {
            tags: this.db.prepare(`
        SELECT t.tag,COUNT(*) AS deck_count
        FROM moxfield_deck_tags t
        JOIN moxfield_decks d ON d.public_id=t.public_id
        WHERE d.archived_at IS NULL
        GROUP BY t.tag ORDER BY t.tag
      `).all().map(row => ({ tag: String(row.tag), deckCount: Number(row.deck_count) })),
            untaggedActiveDecks: Number(this.db.prepare(`
        SELECT COUNT(*) AS count FROM moxfield_decks d
        WHERE d.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM moxfield_deck_tags t WHERE t.public_id=d.public_id)
      `).get().count),
        };
    }
    account() {
        const row = this.db.prepare("SELECT * FROM moxfield_account WHERE singleton=1").get();
        if (!row)
            return {};
        return {
            userName: row.user_name ? String(row.user_name) : undefined,
            userId: row.user_id ? String(row.user_id) : undefined,
            collectionPublicId: row.collection_public_id ? String(row.collection_public_id) : undefined,
            collectionUrl: row.collection_url ? String(row.collection_url) : undefined,
            discoveredAt: String(row.discovered_at),
        };
    }
    status() {
        const counts = this.db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived,
        SUM(CASE WHEN snapshot_refreshed_at IS NOT NULL THEN 1 ELSE 0 END) AS cached
      FROM moxfield_decks
    `).get();
        return {
            path: this.path,
            account: this.account(),
            totalDecks: Number(counts.total ?? 0),
            activeDecks: Number(counts.active ?? 0),
            archivedDecks: Number(counts.archived ?? 0),
            cachedDecks: Number(counts.cached ?? 0),
            ...this.tagSummary(),
        };
    }
    assertDeck(publicId) {
        if (!this.db.prepare("SELECT 1 FROM moxfield_decks WHERE public_id=?").get(publicId))
            throw new Error(`Unknown Moxfield deck: ${publicId}`);
    }
}
function normalizeTag(value) {
    const tag = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/.test(tag))
        throw new Error("Tags must be 1-100 lowercase letters, numbers, colons, underscores, or hyphens.");
    return tag;
}
function mapDeckRow(row) {
    return {
        publicId: String(row.public_id),
        internalId: row.internal_id ? String(row.internal_id) : undefined,
        name: String(row.name),
        format: row.format ? String(row.format) : undefined,
        visibility: row.visibility ? String(row.visibility) : undefined,
        publicUrl: String(row.public_url),
        remoteUpdatedAt: row.remote_updated_at ? String(row.remote_updated_at) : undefined,
        snapshotRefreshedAt: row.snapshot_refreshed_at ? String(row.snapshot_refreshed_at) : undefined,
        archivedAt: row.archived_at ? String(row.archived_at) : undefined,
        cardCount: Number(row.card_count ?? 0),
        uniqueCards: Number(row.unique_cards ?? 0),
    };
}
