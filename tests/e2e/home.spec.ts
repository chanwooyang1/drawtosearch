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
        clarification: null,
        regenerationPrompt: "루이비통 모노그램 참조 이미지",
        resultMode: "resolved",
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

test("asks one clarification question and re-runs search with the answer", async ({ page }) => {
  await page.route("**/api/search", async (route) => {
    const payload = route.request().postDataJSON() as {
      clarificationAnswers?: Array<{ answer: string; questionId: string }>;
    };
    const answered = Boolean(payload.clarificationAnswers?.length);

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(
        answered
          ? {
              candidateEntities: [
                  {
                    confidence: 0.92,
                    id: "candidate-1",
                    label: "TeamViewer logo",
                    query: "TeamViewer logo icon official",
                    queryVariants: ["TeamViewer", "TeamViewer logo icon official"],
                    rationale: "clarification answer matched the service icon direction",
                    source: "agent",
                  },
                ],
              handoffUrls: {
                googleImages: "https://www.google.com/search?tbm=isch&q=TeamViewer",
                googleWeb: "https://www.google.com/search?q=TeamViewer",
                naverImages: "https://search.naver.com/search.naver?where=image&query=TeamViewer",
              },
              imageAssistMode: "hybrid-vision",
              naverResults: [
                {
                  id: "result-1",
                  link: "https://example.com/teamviewer-1",
                  query: "TeamViewer logo icon official",
                  source: "local",
                  thumbnailUrl: "data:image/svg+xml;base64,PHN2Zy8+",
                  title: "TeamViewer logo",
                },
              ],
              providerMode: "mock",
              queryVariants: ["TeamViewer", "TeamViewer logo icon official"],
              clarification: null,
              regenerationPrompt: "TeamViewer 로고 reference",
              resultMode: "resolved",
              reasoning: ["확인 질문 답변을 반영해 서비스 아이콘 후보로 좁혔습니다."],
              searchPrompts: ["TeamViewer logo icon official"],
              sessionId: "clarified-session",
            }
          : {
              candidateEntities: [
                {
                  confidence: 0.62,
                  id: "candidate-1",
                  label: "서비스 아이콘 또는 소프트웨어 심볼",
                  query: "파란색 흰색 원형 서비스 아이콘 reference",
                  queryVariants: ["서비스 아이콘", "파란색 흰색 원형 서비스 아이콘 reference"],
                  rationale: "still broad",
                  source: "heuristic",
                },
              ],
              handoffUrls: {
                googleImages: "https://www.google.com/search?tbm=isch&q=service+icon",
                googleWeb: "https://www.google.com/search?q=service+icon",
                naverImages: "https://search.naver.com/search.naver?where=image&query=service+icon",
              },
              imageAssistMode: "hybrid-vision",
              naverResults: [
                {
                  id: "result-1",
                  link: "https://example.com/ambiguous-1",
                  query: "파란색 흰색 원형 서비스 아이콘 reference",
                  source: "mock",
                  thumbnailUrl: "data:image/svg+xml;base64,PHN2Zy8+",
                  title: "Blue white round service mark",
                },
              ],
              providerMode: "mock",
              queryVariants: ["서비스 아이콘", "파란색 흰색 원형 서비스 아이콘 reference"],
              clarification: {
                id: "app_icon_simple",
                options: [
                  "네, 앱 아이콘처럼 단순했어요",
                  "아니요, 로고/마크 쪽이었어요",
                  "잘 모르겠어요",
                ],
                question: "전체 느낌이 앱 아이콘처럼 단순하고 작은 심볼에 가까웠나요?",
              },
              regenerationPrompt: "서비스 아이콘 reference",
              resultMode: "needs_clarification",
              reasoning: ["자동 재검색 뒤에도 ambiguity가 남아 확인 질문 1회를 준비했습니다."],
              searchPrompts: ["파란색 흰색 원형 서비스 아이콘 reference"],
              sessionId: "needs-clarification",
            },
      ),
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
  await page
    .getByPlaceholder(/갈색 바탕에 반복 무늬/)
    .fill("파란색과 흰색이 보이는 둥근 서비스 마크 같아요.");

  await page.getByRole("button", { name: "검색 시작" }).click();

  await expect(page.getByText("한 가지만 더 확인할게요")).toBeVisible();
  await page.getByRole("button", { name: "네, 앱 아이콘처럼 단순했어요" }).click();

  await expect(
    page.getByRole("heading", { name: /가장 가까운 추정: TeamViewer logo/ }),
  ).toBeVisible();
  await expect(page.getByText("Local reference")).toBeVisible();
});
