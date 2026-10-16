import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const helper = fileURLToPath(new URL("../python/moxfield_account.py", import.meta.url));
function safeCredential(value, label) {
    const trimmed = value.trim();
    if (!trimmed)
        throw new Error(`${label} is required.`);
    if (/\r|\n/.test(trimmed))
        throw new Error(`${label} cannot contain line breaks.`);
    return trimmed;
}
function runHelper(mode, credential) {
    return new Promise((resolve, reject) => {
        const child = spawn("python3", [helper, mode], { stdio: ["pipe", "pipe", "pipe"] });
        const stdout = [];
        const stderr = [];
        let size = 0;
        const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
        child.stdout.on("data", chunk => {
            size += chunk.length;
            if (size > 32 * 1024 * 1024)
                child.kill("SIGKILL");
            else
                stdout.push(chunk);
        });
        child.stderr.on("data", chunk => stderr.push(chunk));
        child.on("error", error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("close", code => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `Moxfield helper exited with code ${code}.`));
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
            }
            catch {
                reject(new Error("Moxfield helper returned invalid JSON."));
            }
        });
        child.stdin.end(JSON.stringify({ credential }));
    });
}
export async function exchangeSessionCookie(cookieHeader) {
    const payload = await runHelper("cookie", safeCredential(cookieHeader, "Moxfield cookie header"));
    const refresh = payload.refresh;
    if (!refresh?.access_token)
        throw new Error("Moxfield did not return an authenticated access token.");
    const collectionPublicId = refresh.collectionPublicId;
    return {
        token: refresh.access_token,
        account: {
            userName: refresh.user_name,
            userId: refresh.user_id,
            collectionPublicId,
            collectionUrl: collectionPublicId ? `https://moxfield.com/collection/${collectionPublicId}` : undefined,
        },
    };
}
export function normalizeDiscoveredDecks(payload) {
    const decks = Array.isArray(payload.decks) ? payload.decks : [];
    return decks.map((deck) => {
        const publicId = String(deck.publicId ?? "").trim();
        if (!/^[A-Za-z0-9_-]+$/.test(publicId))
            throw new Error("Moxfield returned an invalid deck public ID.");
        return {
            publicId,
            internalId: deck.id ? String(deck.id) : undefined,
            name: String(deck.name ?? publicId),
            format: deck.format ? String(deck.format) : undefined,
            visibility: deck.visibility ? String(deck.visibility) : undefined,
            publicUrl: String(deck.publicUrl ?? `https://moxfield.com/decks/${publicId}`),
            updatedAt: deck.lastUpdatedAtUtc ? String(deck.lastUpdatedAtUtc) : undefined,
        };
    });
}
export async function discoverMoxfieldDecks(token) {
    const payload = await runHelper("bearer", safeCredential(token, "Moxfield bearer token"));
    return normalizeDiscoveredDecks(payload);
}
