import { expect, test } from "@playwright/test";

const BASE_URL = process.env.APP_URL || "https://ug.kyrgyzstan.kg/pomotask";
const UNIQUE = `Test quote ${Date.now()}`;

test.describe("Quote banner", () => {
	let original = null;

	test.beforeAll(async ({ request }) => {
		const res = await request.get(`${BASE_URL}/api/quote`);
		original = (await res.json()).quote?.content ?? "";
	});

	test.afterAll(async ({ request }) => {
		await request.put(`${BASE_URL}/api/quote`, { data: { content: original } });
	});

	test.beforeEach(async ({ page }) => {
		await page.goto(BASE_URL);
		await page.waitForTimeout(500);
	});

	test("placeholder, edit, save, persists, clears", async ({ page, request }) => {
		// Start from empty
		await request.put(`${BASE_URL}/api/quote`, { data: { content: "" } });
		await page.reload();
		await page.waitForTimeout(500);

		// Placeholder visible
		const block = page.locator(".quote-block");
		await expect(block).toContainText("add a quote");

		// Open editor, type, save
		await block.click();
		await page.waitForTimeout(300);
		const textarea = page.locator("textarea[maxlength='300']");
		await expect(textarea).toBeVisible();
		await textarea.fill(UNIQUE);
		await page.getByRole("button", { name: "Save" }).click();
		await page.waitForTimeout(500);
		await expect(page.locator(".quote-text")).toHaveText(`❝ ${UNIQUE}`);

		// Persists after reload
		await page.reload();
		await page.waitForTimeout(500);
		await expect(page.locator(".quote-text")).toHaveText(`❝ ${UNIQUE}`);

		// Clear → back to placeholder
		await page.locator(".quote-block").click();
		await page.waitForTimeout(300);
		await page.locator("textarea[maxlength='300']").fill("");
		await page.getByRole("button", { name: "Save" }).click();
		await page.waitForTimeout(500);
		await expect(page.locator(".quote-placeholder")).toContainText("add a quote");
	});
});
