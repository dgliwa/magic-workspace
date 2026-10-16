import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
const within = (parent, child) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
export function resolveWorkspacePath(configured) { const path = resolve((configured ?? "~/dev/magic-decks").replace(/^~(?=\/)/, process.env.HOME ?? "")); if (!existsSync(path) || !lstatSync(path).isDirectory())
    throw new Error(`Magic workspace directory not found: ${path}`); return path; }
export function resolveCachePath(stateDir, configured) { const root = resolve(stateDir); if (!configured)
    return resolve(root, "plugins", "magic-workspace", "magic.sqlite"); if (configured === ":memory:")
    return configured; if (configured.includes("\0"))
    throw new Error("Cache path cannot contain null bytes."); if (isAbsolute(configured))
    return resolve(configured); const path = resolve(root, configured); if (!within(root, path))
    throw new Error("Relative cache path must remain inside OpenClaw state."); return path; }
