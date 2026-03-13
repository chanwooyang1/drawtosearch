import { expect, test } from "@playwright/test";

test("supports the mobile search flow", async ({ page }) => {
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
