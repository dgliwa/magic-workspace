#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
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

let cookie = await secretPrompt("Paste the Moxfield Cookie request-header value: ");
let registry;
try {
  const exchanged = await exchangeSessionCookie(cookie);
  cookie = "";
  let token = exchanged.token;
  const decks = await discoverMoxfieldDecks(token);
  token = "";

  registry = new MoxfieldRegistry(databasePath());
  const discovery = registry.importDiscovery(exchanged.account, decks);
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
    account: exchanged.account,
    discoveredDecks: decks.length,
    refreshedPublicSnapshots: refreshed.length,
    failedSnapshots: failed,
    status: registry.status(),
    discovery,
  }, null, 2));
} finally {
  cookie = "";
  registry?.close();
}
