#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { discoverMoxfieldDecks, exchangeSessionCookie } from "../dist/moxfield-account.js";
import { fetchMoxfieldDeck } from "../dist/moxfield.js";
import { MoxfieldRegistry } from "../dist/moxfield-registry.js";

function databasePath() {
  if (process.env.MAGIC_WORKSPACE_DB) return resolve(process.env.MAGIC_WORKSPACE_DB);
  const state = process.env.OPENCLAW_STATE_DIR
    ? resolve(process.env.OPENCLAW_STATE_DIR)
    : resolve(homedir(), ".openclaw");
  return resolve(state, "plugins", "magic-workspace", "magic.sqlite");
}

function configuredCollection() {
  const workspace = process.env.MAGIC_WORKSPACE_PATH
    ? resolve(process.env.MAGIC_WORKSPACE_PATH)
    : resolve(homedir(), "dev", "magic-decks");
  try {
    const config = JSON.parse(readFileSync(resolve(workspace, "collection/config/inventory.json"), "utf8"));
    const collectionUrl = String(config.collection_url ?? "");
    const match = collectionUrl.match(/^https:\/\/moxfield\.com\/collection\/([A-Za-z0-9_-]+)$/i);
    return match ? { collectionPublicId: match[1], collectionUrl } : {};
  } catch {
    return {};
  }
}

async function secretPrompt(question) {
  const useTty = input.isTTY && output.isTTY;
  const source = useTty ? input : createReadStream("/dev/tty");
  const sink = useTty ? output : createWriteStream("/dev/tty");
  const rl = createInterface({ input: source, output: sink, terminal: true });
  try {
    execFileSync("stty", ["-echo"], { stdio: [source, "ignore", "ignore"] });
    const answer = await rl.question(question);
    sink.write("\n");
    return answer;
  } finally {
    try { execFileSync("stty", ["echo"], { stdio: [source, "ignore", "ignore"] }); } catch {}
    rl.close();
  }
}

const bearerMode = process.argv.includes("--bearer");
let credential = await secretPrompt(bearerMode
  ? "Paste the short-lived Moxfield bearer access token: "
  : "Paste the Moxfield Cookie request-header value: ");
let registry;
try {
  let token;
  let account;
  if (bearerMode) {
    token = credential.trim();
    account = configuredCollection();
  } else {
    const exchanged = await exchangeSessionCookie(credential);
    token = exchanged.token;
    account = exchanged.account;
  }
  credential = "";
  const decks = await discoverMoxfieldDecks(token);
  token = "";

  registry = new MoxfieldRegistry(databasePath());
  const discovery = registry.importDiscovery(account, decks);
  const refreshed = [];
  const failed = [];

  for (const deck of decks) {
    try {
      const snapshot = await fetchMoxfieldDeck(deck.publicUrl);
      registry.saveSnapshot(snapshot);
      refreshed.push(deck.publicId);
    } catch (error) {
      failed.push({
        publicId: deck.publicId,
        name: deck.name,
        visibility: deck.visibility,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    database: databasePath(),
    account,
    discoveredDecks: decks.length,
    refreshedPublicSnapshots: refreshed.length,
    failedSnapshots: failed,
    status: registry.status(),
    discovery,
  }, null, 2));
} finally {
  credential = "";
  registry?.close();
}
