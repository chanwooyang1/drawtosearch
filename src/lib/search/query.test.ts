import { buildQueryVariants, normalizeSearchText, scoreTokenOverlap } from "./query";

describe("search query helpers", () => {
  it("normalizes punctuation and spacing", () => {
    expect(normalizeSearchText("  LV, Monogram!  ")).toBe("lv monogram");
  });

  it("builds deduped query variants", () => {
    expect(
      buildQueryVariants({
        label: "루이비통",
        query: "루이비통 로고",
        userText: "갈색 모노그램 명품",
      }),
    ).toEqual([
      "루이비통",
      "루이비통 로고",
      "루이비통 갈색 모노그램 명품",
      "갈색 모노그램 명품",
    ]);
  });

  it("scores overlapping tokens", () => {
    expect(scoreTokenOverlap("갈색 명품 로고", "갈색 명품 브랜드")).toBeGreaterThan(
      0.3,
    );
  });
});
