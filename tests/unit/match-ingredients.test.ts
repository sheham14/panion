import { describe, it, expect } from "vitest";
import { matchIngredientsToGroups } from "@/lib/recipes/match-ingredients";
import type { Complete } from "@/lib/ai/complete";

const GROUPS = ["salted-butter", "peanut-butter", "shredded-mozzarella-cheese", "2-percent-milk"];
const reply = (text: string | null): Complete => async () => text;

describe("matchIngredientsToGroups", () => {
  it("maps each ingredient to the group the model chose", async () => {
    const out = await matchIngredientsToGroups(
      ["butter", "shredded mozzarella", "water"],
      GROUPS,
      reply('[{"i":0,"group":"salted-butter"},{"i":1,"group":"shredded-mozzarella-cheese"},{"i":2,"group":null}]'),
    );
    expect(out).toEqual(["salted-butter", "shredded-mozzarella-cheese", null]);
  });

  it("rejects a slug the catalogue does not have", async () => {
    const out = await matchIngredientsToGroups(
      ["butter"],
      GROUPS,
      reply('[{"i":0,"group":"unsalted-cultured-butter"}]'),
    );
    expect(out).toEqual([null]);
  });

  it("tolerates prose or a fence around the array", async () => {
    const out = await matchIngredientsToGroups(
      ["milk"],
      GROUPS,
      reply('Here you go:\n```json\n[{"i":0,"group":"2-percent-milk"}]\n```'),
    );
    expect(out).toEqual(["2-percent-milk"]);
  });

  it("ignores rows that point at no ingredient", async () => {
    const out = await matchIngredientsToGroups(
      ["butter"],
      GROUPS,
      reply('[{"i":5,"group":"salted-butter"},{"i":"0","group":"salted-butter"}]'),
    );
    expect(out).toEqual([null]);
  });

  it("returns null — retry later — when the model gives nothing usable", async () => {
    expect(await matchIngredientsToGroups(["butter"], GROUPS, reply(null))).toBeNull();
    expect(await matchIngredientsToGroups(["butter"], GROUPS, reply("no idea"))).toBeNull();
    const throws: Complete = async () => {
      throw new Error("network");
    };
    expect(await matchIngredientsToGroups(["butter"], GROUPS, throws)).toBeNull();
  });
});
