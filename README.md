# Magic Workspace

An OpenClaw plugin that treats Moxfield as the source of truth, `~/dev/magic-decks` as a human-readable local cache, and Scryfall as the authoritative card-data source.

## Tools

### Moxfield account registry

- `magic_moxfield_registry_status` — show the discovered account, public collection URL, and cache health
- `magic_moxfield_registry_list` — list discovered account decks; missing remote decks are archived
- `magic_moxfield_registry_get` — read a normalized SQLite deck snapshot
- `magic_moxfield_registry_refresh` — confirmation-gated refresh from stored public URLs
- `magic_deck_tag_add` — add normalized local metadata such as `built`, `precon`, or `testing`
- `magic_deck_tag_remove` — remove one local tag
- `magic_deck_tags_set` — replace all local tags for one deck
- `magic_deck_tag_summary` — summarize tag usage and untagged active decks

Registry listing accepts an exact `tag` filter. Tags are durable local metadata and are preserved when deck snapshots are refreshed or when missing remote decks are archived. They never modify Moxfield.

Account discovery is an explicit bootstrap operation run over SSH:

```bash
npm run moxfield:import
```

The command securely prompts for the `Cookie` request-header value from a logged-in Moxfield browser. Terminal echo is disabled. It exchanges the cookie for a short-lived bearer token, stores only account metadata and public deck/collection URLs, refreshes publicly readable deck snapshots, and discards both credentials. Because Cloudflare may bind browser cookies to a client, a 403 can be bypassed with the short-lived token returned by `startup/authenticated`:

```bash
npm run moxfield:import -- --bearer
```

Bearer mode retains the already configured public collection URL and likewise never stores the token. Run discovery again only when you need to find newly created decks. Private or unlisted decks are recorded but may not refresh without another authenticated session.

### Legacy filesystem decks

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

### Commander Workshop

- `magic_commander_random` — request a random legal commander from Scryfall using exactly `is:commander`, then develop three theme pitches before searching for cards
- `magic_commander_theme_search` — after theme confirmation, run role-specific advanced searches constrained by Commander legality and color identity and ordered by Scryfall EDHREC rank
- `magic_commander_deck_validate` — validate each proposed price tier for 100-card size, legality, color identity, singleton rules, land count, and indicative Scryfall pricing

Commander Workshop defaults user-facing results to the `#magic` Discord channel. Its standard price ladder is $50 budget, $125 established, and $250 premium-casual, with configurable per-card ceilings. Scryfall's EDHREC order is treated as global Commander popularity rather than commander-specific synergy; thematic relevance comes from the advanced query and deck analysis.

### Scryfall

- `magic_scryfall_card` — exact card retrieval with cache-first or live modes
- `magic_scryfall_search` — live Scryfall syntax or local cached text search
- `magic_scryfall_rulings`
- `magic_scryfall_cache_status`
- `magic_scryfall_cache_refresh` — confirmation-gated bulk oracle-card cache rebuild

The Scryfall cache uses the official daily `oracle_cards` bulk dataset and stores normalized searchable records plus original JSON in owner-only SQLite storage.

## Moxfield writes

Magic Workspace uses authentication only for explicit account discovery. It does not retain Moxfield credentials or expose remote mutations. Discovered deck metadata and normalized snapshots live in the plugin SQLite database; public URLs are used for later refreshes. The existing `~/dev/magic-decks` text files remain available through the legacy tools during migration but are no longer required for newly discovered deck snapshots. Moxfield has no supported public API; authenticated writes will be added as a separate hash-bound prepare/review/apply workflow after browser-session authentication and current mutation payloads are verified.

## Configuration

```json
{
  "workspacePath": "~/dev/magic-decks",
  "cachePath": "plugins/magic-workspace/magic.sqlite",
  "commanderWorkshopDiscordTarget": "channel:1560498017394499706"
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
