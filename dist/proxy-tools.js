import { Type } from "typebox";
import { ProxyStore, resolveProxyRoot } from "./proxy-store.js";
const proxyId = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 200 });
const tags = Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 30 });
function store(api, config) {
    return new ProxyStore(resolveProxyRoot(api.runtime.state.resolveStateDir(process.env), config.proxyRoot));
}
export function proxyTools(tool) {
    return [
        tool({
            name: "magic_proxy_create",
            description: "Store one uploaded alternate-art Magic proxy. Resolves the exact card through Scryfall, sanitizes the local JPEG/PNG/WebP artwork into managed WebP, strips metadata, and records publication-safe metadata. This stores a private source record only; it does not create or publish a blog draft.",
            parameters: Type.Object({
                sourcePath: Type.String({ minLength: 1, description: "Absolute or working-directory-relative path to the staged uploaded image." }),
                cardName: Type.String({ minLength: 1, maxLength: 500 }),
                alt: Type.String({ minLength: 8, maxLength: 1_000 }),
                caption: Type.Optional(Type.String({ maxLength: 500 })),
                occurredAt: Type.Optional(Type.String({ minLength: 1 })),
                title: Type.Optional(Type.String({ maxLength: 200 })),
                summary: Type.Optional(Type.String({ maxLength: 500 })),
                notes: Type.Optional(Type.String({ maxLength: 10_000 })),
                tags: Type.Optional(tags),
                id: Type.Optional(proxyId),
            }, { additionalProperties: false }),
            execute: async (input, config, { api, signal }) => {
                signal?.throwIfAborted();
                return store(api, config).create(input);
            },
        }),
        tool({
            name: "magic_proxy_get",
            description: "Get one stored Magic proxy, including its managed artwork path and resolved Scryfall metadata.",
            parameters: Type.Object({ id: proxyId }, { additionalProperties: false }),
            execute: async ({ id }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return store(api, config).get(id);
            },
        }),
        tool({
            name: "magic_proxy_list",
            description: "List stored Magic proxies newest first. Archived records are hidden unless requested.",
            parameters: Type.Object({ includeArchived: Type.Optional(Type.Boolean({ default: false })) }, { additionalProperties: false }),
            execute: async ({ includeArchived }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return { proxies: await store(api, config).list(includeArchived ?? false) };
            },
        }),
        tool({
            name: "magic_proxy_update",
            description: "Update one stored Magic proxy. Optionally replace its artwork from another staged local image; replacement is sanitized before becoming active.",
            parameters: Type.Object({
                id: proxyId,
                sourcePath: Type.Optional(Type.String({ minLength: 1 })),
                alt: Type.Optional(Type.String({ minLength: 8, maxLength: 1_000 })),
                caption: Type.Optional(Type.String({ maxLength: 500 })),
                title: Type.Optional(Type.String({ maxLength: 200 })),
                summary: Type.Optional(Type.String({ maxLength: 500 })),
                notes: Type.Optional(Type.String({ maxLength: 10_000 })),
                tags: Type.Optional(tags),
            }, { additionalProperties: false }),
            execute: async ({ id, ...patch }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return store(api, config).update(id, patch);
            },
        }),
        tool({
            name: "magic_proxy_archive",
            description: "Archive a stored Magic proxy without deleting its managed artwork or publication history.",
            parameters: Type.Object({ id: proxyId }, { additionalProperties: false }),
            execute: async ({ id }, config, { api, signal }) => {
                signal?.throwIfAborted();
                return store(api, config).archive(id);
            },
        }),
    ];
}
