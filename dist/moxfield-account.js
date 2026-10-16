const API = "https://api2.moxfield.com";
const USER_AGENT = "MagicWorkspace/0.2 (+https://github.com/dgliwa/magic-workspace)";
function safeCredential(value, label) {
    const trimmed = value.trim();
    if (!trimmed)
        throw new Error(`${label} is required.`);
    if (/\r|\n/.test(trimmed))
        throw new Error(`${label} cannot contain line breaks.`);
    return trimmed;
}
async function jsonRequest(url, init) {
    const response = await fetch(url, {
        ...init,
        redirect: "error",
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json,text/plain,*/*",
            Origin: "https://moxfield.com",
            Referer: "https://moxfield.com/",
            ...init.headers,
        },
    });
    if (!response.ok)
        throw new Error(`Moxfield request failed with HTTP ${response.status}.`);
    return response.json();
}
export async function exchangeSessionCookie(cookieHeader) {
    const payload = await jsonRequest(`${API}/v1/startup/authenticated`, {
        method: "POST",
        headers: {
            Cookie: safeCredential(cookieHeader, "Moxfield cookie header"),
            "Content-Type": "application/json",
        },
        body: "{}",
    });
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
export async function discoverMoxfieldDecks(token) {
    const payload = await jsonRequest(`${API}/v3/decks`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${safeCredential(token, "Moxfield bearer token")}`,
        },
    });
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
