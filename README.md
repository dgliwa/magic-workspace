# Magic Workspace

An OpenClaw plugin that treats Moxfield as the source of truth, `~/dev/magic-decks` as a human-readable local cache, and Scryfall as the authoritative card-data source.

## Tools

### Decks

- `magic_deck_list` — list cached Commander decks and active status
- `magic_deck_get` — read a complete local deck
- `magic_moxfield_deck_fetch` — fetch a public Moxfield deck without writing
- `magic_deck_diff` — compare local cache with Moxfield
- `magic_deck_sync` — confirmation-gated local refresh from Moxfield

### Collection

- `magic_collection_sync` — confirmation-gated Moxfield collection refresh and summary regeneration
- `magic_collection_search`
- `magic_collection_card`
- `magic_collection_summary`

### Scryfall

- `magic_scryfall_card` — exact card retrieval with cache-first or live modes
- `magic_scryfall_search` — live Scryfall syntax or local cached text search
- `magic_scryfall_rulings`
- `magic_scryfall_cache_status`
- `magic_scryfall_cache_refresh` — confirmation-gated bulk oracle-card cache rebuild

The Scryfall cache uses the official daily `oracle_cards` bulk dataset and stores normalized searchable records plus original JSON in owner-only SQLite storage.

## Moxfield writes

Version 0.1 reads public Moxfield decks and collections and refreshes the local cache. Remote Moxfield mutations are deliberately not exposed yet. Moxfield has no supported public API; authenticated writes will be added as a separate hash-bound prepare/review/apply workflow after browser-session authentication and current mutation payloads are verified.

## Configuration

```json
{
  "workspacePath": "~/dev/magic-decks",
  "cachePath": "plugins/magic-workspace/magic.sqlite"
}
```

Both fields are optional.

## Verification

```bash
npm install
npm test
npm run plugin:build
npm run plugin:validate
npm audit --omit=dev
```
