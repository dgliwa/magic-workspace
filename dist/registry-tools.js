import { Type } from "typebox";
import { fetchMoxfieldDeck } from "./moxfield.js";
import { MoxfieldRegistry } from "./moxfield-registry.js";
import { resolveCachePath } from "./paths.js";
const publicIdSchema = Type.String({ pattern: "^[A-Za-z0-9_-]+$", maxLength: 200 });
const tagSchema = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$", maxLength: 100 });
function withRegistry(api, configuredPath, operation) {
    const stateDir = api.runtime.state.resolveStateDir(process.env);
    const registry = new MoxfieldRegistry(resolveCachePath(stateDir, configuredPath));
    try {
        return operation(registry);
    }
    finally {
        registry.close();
    }
}
export function registryTools(tool) {
    return [
        tool({
            name: "magic_moxfield_registry_status",
            description: "Show authenticated-discovery metadata, stored public collection URL, deck-cache counts, and local tag summary. Never returns credentials.",
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_input, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.status());
            },
        }),
        tool({
            name: "magic_moxfield_registry_list",
            description: "List discovered account decks with their local tags. Filter by text, archive state, or one exact normalized tag.",
            parameters: Type.Object({
                query: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
                tag: Type.Optional(tagSchema),
                includeArchived: Type.Optional(Type.Boolean({ default: false })),
            }, { additionalProperties: false }),
            execute: async (input, config, { api, signal }) => {
                signal?.throwIfAborted();
                return { decks: withRegistry(api, config.cachePath, registry => registry.list(input)) };
            },
        }),
        tool({
            name: "magic_moxfield_registry_get",
            description: "Read one normalized SQLite deck snapshot and its local tags by stable Moxfield public ID.",
            parameters: Type.Object({ publicId: publicIdSchema }, { additionalProperties: false }),
            execute: async ({ publicId }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.get(publicId));
            },
        }),
        tool({
            name: "magic_moxfield_registry_refresh",
            description: "Refresh one or all active normalized deck snapshots from their public Moxfield URLs. Requires explicit confirmation and never writes to Moxfield.",
            parameters: Type.Object({ publicId: Type.Optional(publicIdSchema), confirmed: Type.Literal(true) }, { additionalProperties: false }),
            execute: async ({ publicId }, config, { api, signal }) => {
                const stateDir = api.runtime.state.resolveStateDir(process.env);
                const registry = new MoxfieldRegistry(resolveCachePath(stateDir, config.cachePath));
                try {
                    const decks = publicId
                        ? [registry.list({ includeArchived: true }).find(deck => deck.publicId === publicId)].filter(Boolean)
                        : registry.list();
                    if (!decks.length)
                        throw new Error(publicId ? `Unknown Moxfield deck: ${publicId}` : "No active Moxfield decks have been discovered.");
                    const refreshed = [];
                    const failed = [];
                    for (const deck of decks) {
                        signal?.throwIfAborted();
                        try {
                            const snapshot = await fetchMoxfieldDeck(deck.publicUrl);
                            registry.saveSnapshot(snapshot);
                            refreshed.push(deck.publicId);
                        }
                        catch (error) {
                            failed.push({ publicId: deck.publicId, error: error instanceof Error ? error.message : String(error) });
                        }
                    }
                    return { refreshed, failed };
                }
                finally {
                    registry.close();
                }
            },
        }),
        tool({
            name: "magic_deck_tag_add",
            description: "Add one normalized local tag to a discovered Moxfield deck. Tags are local metadata and do not modify Moxfield.",
            parameters: Type.Object({ publicId: publicIdSchema, tag: tagSchema }, { additionalProperties: false }),
            execute: async ({ publicId, tag }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.addTag(publicId, tag));
            },
        }),
        tool({
            name: "magic_deck_tag_remove",
            description: "Remove one local tag from a discovered Moxfield deck. This does not modify Moxfield.",
            parameters: Type.Object({ publicId: publicIdSchema, tag: tagSchema }, { additionalProperties: false }),
            execute: async ({ publicId, tag }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.removeTag(publicId, tag));
            },
        }),
        tool({
            name: "magic_deck_tags_set",
            description: "Replace all local tags on one discovered Moxfield deck with a normalized deduplicated set. This does not modify Moxfield.",
            parameters: Type.Object({ publicId: publicIdSchema, tags: Type.Array(tagSchema, { maxItems: 50 }) }, { additionalProperties: false }),
            execute: async ({ publicId, tags }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.setTags(publicId, tags));
            },
        }),
        tool({
            name: "magic_deck_tag_summary",
            description: "Summarize local deck tags and count active decks that remain untagged.",
            parameters: Type.Object({}, { additionalProperties: false }),
            execute: async (_input, config, { api, signal }) => {
                signal?.throwIfAborted();
                return withRegistry(api, config.cachePath, registry => registry.tagSummary());
            },
        }),
    ];
}
