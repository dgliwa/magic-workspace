import { describe, expect, it } from "vitest";
import entry from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";

describe("magic-workspace", () => {
  it("declares tool metadata", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "magic_moxfield_registry_status","magic_moxfield_registry_list","magic_moxfield_registry_get","magic_moxfield_registry_refresh",
      "magic_deck_tag_add","magic_deck_tag_remove","magic_deck_tags_set","magic_deck_tag_summary",
      "magic_deck_list","magic_deck_get","magic_moxfield_deck_fetch","magic_deck_diff","magic_deck_sync",
      "magic_collection_sync","magic_collection_search","magic_collection_card","magic_collection_summary",
      "magic_scryfall_card","magic_scryfall_search","magic_scryfall_rulings","magic_scryfall_cache_status","magic_scryfall_cache_refresh",
    ]);
  });
});
