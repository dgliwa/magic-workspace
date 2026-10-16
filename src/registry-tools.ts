import { Type } from "typebox";
import { fetchMoxfieldDeck } from "./moxfield.js";
import { MoxfieldRegistry } from "./moxfield-registry.js";
import { resolveCachePath } from "./paths.js";

const publicIdSchema = Type.String({ pattern: "^[A-Za-z0-9_-]+$", maxLength: 200 });

function withRegistry<T>(api: any, configuredPath: string | undefined, operation: (registry: MoxfieldRegistry) => T): T {
  const stateDir = api.runtime.state.resolveStateDir(process.env);
  const registry = new MoxfieldRegistry(resolveCachePath(stateDir, configuredPath));
  try {
    return operation(registry);
  } finally {
    registry.close();
  }
}

export function registryTools(tool: any) {
  return [
    tool({
      name: "magic_moxfield_registry_status",
      description: "Show authenticated-discovery metadata, stored public collection URL, and SQLite deck-cache counts. Never returns credentials.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_input: unknown, config: any, { api, signal }: any) => {
        signal?.throwIfAborted();
        return withRegistry(api, config.cachePath, registry => registry.status());
      },
    }),
    tool({
      name: "magic_moxfield_registry_list",
      description: "List account decks discovered through the one-time authenticated bootstrap. Missing decks are archived, not deleted.",
      parameters: Type.Object({
        query: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
        includeArchived: Type.Optional(Type.Boolean({ default: false })),
      }, { additionalProperties: false }),
      execute: async (input: { query?: string; includeArchived?: boolean }, config: any, { api, signal }: any) => {
        signal?.throwIfAborted();
        return { decks: withRegistry(api, config.cachePath, registry => registry.list(input)) };
      },
    }),
    tool({
      name: "magic_moxfield_registry_get",
      description: "Read a normalized SQLite deck snapshot by its stable Moxfield public ID.",
      parameters: Type.Object({ publicId: publicIdSchema }, { additionalProperties: false }),
      execute: async ({ publicId }: { publicId: string }, config: any, { api, signal }: any) => {
        signal?.throwIfAborted();
        return withRegistry(api, config.cachePath, registry => registry.get(publicId));
      },
    }),
    tool({
      name: "magic_moxfield_registry_refresh",
      description: "Refresh one or all active normalized deck snapshots from their stored public Moxfield URLs. Requires explicit confirmation and never writes to Moxfield.",
      parameters: Type.Object({
        publicId: Type.Optional(publicIdSchema),
        confirmed: Type.Literal(true),
      }, { additionalProperties: false }),
      execute: async ({ publicId }: { publicId?: string }, config: any, { api, signal }: any) => {
        signal?.throwIfAborted();
        const stateDir = api.runtime.state.resolveStateDir(process.env);
        const registry = new MoxfieldRegistry(resolveCachePath(stateDir, config.cachePath));
        try {
          const decks = publicId
            ? [registry.list({ includeArchived: true }).find(deck => deck.publicId === publicId)].filter(Boolean)
            : registry.list();
          if (!decks.length) throw new Error(publicId ? `Unknown Moxfield deck: ${publicId}` : "No active Moxfield decks have been discovered.");
          const refreshed: string[] = [];
          const failed: Array<{ publicId: string; error: string }> = [];
          for (const deck of decks as Array<{ publicId: string; publicUrl: string }>) {
            signal?.throwIfAborted();
            try {
              const snapshot = await fetchMoxfieldDeck(deck.publicUrl);
              registry.saveSnapshot(snapshot);
              refreshed.push(deck.publicId);
            } catch (error) {
              failed.push({ publicId: deck.publicId, error: error instanceof Error ? error.message : String(error) });
            }
          }
          return { refreshed, failed };
        } finally {
          registry.close();
        }
      },
    }),
  ];
}
