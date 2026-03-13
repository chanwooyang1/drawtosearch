import { expect, test } from "@playwright/test";

test("supports the mobile search flow", async ({ page }) => {
  await page.route("**/api/search", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        candidateEntities: [
          {
            confidence: 0.94,
            id: "candidate-1",
            label: "루이비통",
            query: "루이비통 로고 모노그램",
            queryVariants: ["루이비통", "루이비통 로고 모노그램"],
            rationale: "갈색 바탕과 반복 무늬 단서가 루이비통 모노그램과 가장 가깝습니다.",
            source: "agent",
          },
        ],
        handoffUrls: {
          googleImages: "https://www.google.com/search?tbm=isch&q=%EB%A3%A8%EC%9D%B4%EB%B9%84%ED%86%B5",
          googleWeb: "https://www.google.com/search?q=%EB%A3%A8%EC%9D%B4%EB%B9%84%ED%86%B5",
          naverImages: "https://search.naver.com/search.naver?where=image&query=%EB%A3%A8%EC%9D%B4%EB%B9%84%ED%86%B5",
        },
        imageAssistMode: "hybrid-vision",
        naverResults: [
          {
            id: "result-1",
            link: "https://example.com/lv-1",
            query: "루이비통 로고 모노그램",
            source: "mock",
            thumbnailUrl: "data:image/svg+xml;base64,PHN2Zy8+",
            title: "루이비통 모노그램 참고 이미지",
          },
        ],
        providerMode: "mock",
        queryVariants: ["루이비통", "루이비통 로고 모노그램"],
        regenerationPrompt: "루이비통 모노그램 참조 이미지",
        reasoning: ["손그림과 설명을 함께 읽고 실제 브랜드 후보를 추론했습니다."],
        searchPrompts: ["루이비통 로고 모노그램"],
        sessionId: "1f3a1f66-6d49-4d8f-bac8-76a3b86f9179",
      }),
    });
  });
  await page.route("**/api/events/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Draw,/ })).toBeVisible();
  await expect(page.getByText("손가락/펜 입력 가능")).toBeVisible();

  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();

  if (box) {
    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 120, { steps: 8 });
    await page.mouse.up();
  }

  await page
    .getByPlaceholder(/갈색 바탕에 반복 무늬/)
    .fill("갈색 바탕에 반복 무늬가 있고 명품 브랜드 로고 같아요.");
  await page.getByRole("button", { name: "검색 시작" }).click();

  await expect(page.getByText("가장 가까운 추정")).toBeVisible();
  await expect(page.getByText("인앱 이미지 결과")).toBeVisible();
});
