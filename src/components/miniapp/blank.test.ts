import type { PostDraft } from "@/lib/uslub/contract";
import { describe, expect, it } from "vitest";
import { blankScript, blankTokens } from "./blank";

const post = (variants: Partial<PostDraft["variants"]>, placeholders?: PostDraft["placeholders"]): PostDraft =>
  ({ id: "p1", variants: { uz_latn: "", uz_cyrl: "", ru: "", en: "", ...variants }, placeholders, needsApproval: !!placeholders }) as unknown as PostDraft;

describe("blank helpers", () => {
  it("edits the script the server named when the one on screen has no blank left", () => {
    // The owner filled the Russian text; the server refused because the Uzbek one still has «[narx]».
    const p = post({ uz_latn: "Narxi: [narx] so‘m", ru: "Цена: 12 000 сум" });
    const note = { text: "", tone: "hint" as const, missing: [{ script: "uz_latn" as const, tokens: ["[narx]"] }] };
    expect(blankScript(p, note)).toBe("uz_latn");
    expect(blankTokens(p, "uz_latn", note)).toEqual(["[narx]"]);
  });

  it("falls back to the post's own placeholders, skipping scripts already filled", () => {
    const p = post({ uz_latn: "Kod: ABC", ru: "Код: [kod]" }, [
      { script: "uz_latn", tokens: ["[kod]"] },
      { script: "ru", tokens: ["[kod]"] },
    ]);
    expect(blankScript(p)).toBe("ru");
  });

  it("merges the post's and the refusal's tokens without repeats", () => {
    const p = post({ uz_latn: "[narx] va [kod]" }, [{ script: "uz_latn", tokens: ["[narx]"] }]);
    const note = { text: "", tone: "hint" as const, missing: [{ script: "uz_latn" as const, tokens: ["[narx]", "[kod]"] }] };
    expect(blankTokens(p, "uz_latn", note)).toEqual(["[narx]", "[kod]"]);
  });

  it("finds nothing when every blank is filled", () => {
    expect(blankScript(post({ uz_latn: "Narxi: 12 000" }, [{ script: "uz_latn", tokens: ["[narx]"] }]))).toBeNull();
  });
});
