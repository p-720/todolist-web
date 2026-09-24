import { expect, test } from "@playwright/test";

const BASE_URL = process.env.APP_URL || "https://ug.kyrgyzstan.kg/pomotask";

test.describe("PomoTasker Habits", () => {
	test.beforeEach(async ({ page, request }) => {
		// Log in as the migrated owner (p720). Password comes from the env —
		// never hardcode it (only its scrypt hash lives in the codebase).
		const password = process.env.POMOTASK_TEST_PASSWORD;
		if (password) {
			const res = await request.post(`${BASE_URL}/api/auth`, {
				data: { action: "login", username: "p720", password },
			});
			if (!res.ok()) {
				throw new Error(`login as p720 failed: ${res.status()}`);
			}
			// The API `request` context doesn't share cookies with the browser
			// `page`, so copy the session cookie into the page's context or the
			// layout redirects to /login.
			const setCookie = res.headers()["set-cookie"];
			const match = setCookie?.match(/^([^=]+)=([^;]*)/);
			if (match) {
				await page.context().addCookies([{
					name: match[1],
					value: match[2],
					domain: new URL(BASE_URL).hostname,
					path: "/",
					httpOnly: true,
				}]);
			}
		}

		await page.goto(BASE_URL);
		await page.waitForTimeout(500);
		// Clean up test habits left behind by earlier (failed) runs so the
		// hasText locators stay unambiguous.
		await page.evaluate(async (base) => {
			const tree = await (await fetch(`${base}/api/habits`)).json();
			for (const group of tree) {
				for (const h of group.habits ?? []) {
					if (typeof h.description === "string" && h.description.startsWith("Test ")) {
						await fetch(`${base}/api/habits/${h.id}`, { method: "DELETE" });
					}
				}
			}
		}, new URL(BASE_URL).pathname);
		// Override confirm dialogs so delete/archive proceed without blocking
		await page.evaluate(() => {
			window.confirm = () => true;
		});
	});

	test("add a timer habit", async ({ page }) => {
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);

		const nameInput = page.getByRole("textbox", { name: "Name" });
		await expect(nameInput).toBeVisible();
		await nameInput.fill("Test Timer Habit");

		await page.getByRole("combobox", { name: "Type" }).selectOption("timer");

		await page.locator(".submit-btn").click();
		await page.locator(".dialog").waitFor({ state: "hidden" });
		await page.waitForTimeout(500);

		const habitRow = page.locator(".habit-row").filter({ hasText: "Test Timer Habit" });
		await expect(habitRow).toBeVisible();
	});

	test("add and toggle a yes/no habit", async ({ page }) => {
		// Unique per run: earlier failed runs may have left same-named habits behind
		const ynoName = `Test Yes/No ${Date.now()}`;
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);

		const nameInput = page.getByRole("textbox", { name: "Name" });
		await nameInput.fill(ynoName);

		await page.getByRole("combobox", { name: "Type" }).selectOption("boolean");

		await page.locator(".submit-btn").click();
		await page.locator(".dialog").waitFor({ state: "hidden" });
		await page.waitForTimeout(500);

		const habitRow = page.locator(".habit-row").filter({ hasText: ynoName });
		await expect(habitRow).toBeVisible();

		const todayCircle = habitRow.locator(".circle-today");
		await expect(todayCircle).toBeVisible();

		// Toggle ON
		await todayCircle.click();
		await page.waitForTimeout(500);
		await expect(todayCircle).toHaveClass(/circle-complete/);

		// Toggle OFF
		await todayCircle.click();
		await page.waitForTimeout(500);
		await expect(todayCircle).not.toHaveClass(/circle-complete/);
	});

	test("start timer on a timer habit", async ({ page }) => {
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);

		const nameInput = page.getByRole("textbox", { name: "Name" });
		await nameInput.fill("Test Timer Habit 2");

		await page.getByRole("combobox", { name: "Type" }).selectOption("timer");
		await page.locator(".submit-btn").click();
		await page.locator(".dialog").waitFor({ state: "hidden" });
		await page.waitForTimeout(500);

		const habitRow = page.locator(".habit-row").filter({ hasText: "Test Timer Habit 2" });
		const todayCircle = habitRow.locator(".circle-today");

		// Click play button to start timer
		const playButton = habitRow.locator("button[aria-label='Start/stop timer']");
		await expect(playButton).toBeVisible();
		await playButton.click();
		await page.waitForTimeout(1500);

		// Timer running: circle shows elapsed seconds (e.g. "1s")
		await expect(todayCircle).toHaveText(/\d+s/);

		// Stop the timer via play button
		await playButton.click();
		await page.waitForTimeout(1500);

		// Timer stopped: circle shows duration or "✓"
		await expect(todayCircle).toHaveClass(/circle-complete/);
	});

	test("remove a habit", async ({ page }) => {
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);

		const nameInput = page.getByRole("textbox", { name: "Name" });
		await nameInput.fill("Delete Me Habit");

		await page.getByRole("combobox", { name: "Type" }).selectOption("boolean");
		await page.locator(".submit-btn").click();
		await page.locator(".dialog").waitFor({ state: "hidden" });
		await page.waitForTimeout(500);

		const habitRow = page.locator(".habit-row").filter({ hasText: "Delete Me Habit" });
		await expect(habitRow).toBeVisible();

		const deleteBtn = habitRow.getByRole("button", { name: "Delete habit" });
		await expect(deleteBtn).toBeVisible();
		await deleteBtn.click();
		await page.waitForTimeout(1000);

		await expect(habitRow).not.toBeVisible();
	});
});
