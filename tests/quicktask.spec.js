import { expect, test } from "@playwright/test";

const BASE_URL = process.env.APP_URL || "https://ug.kyrgyzstan.kg/pomotask";

test.describe("Quick task timer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(BASE_URL);
		await page.waitForTimeout(500);
		await page.evaluate(() => {
			window.confirm = () => true;
		});
	});

	test("start from banner dialog, shows name, stops from banner, adds no habit", async ({ page }) => {
		const beforeCount = await page.locator(".habit-row").count();

		// open the quick-task dialog
		await page.locator("button[title='Quick task timer — not added to habits']").click();
		await page.waitForTimeout(300);

		const taskInput = page.getByPlaceholder("e.g. Buy groceries, Call mum...");
		await expect(taskInput).toBeVisible();
		await taskInput.fill("E2E Quick Task");

		await page.getByRole("button", { name: "Start timer" }).click();
		await page.waitForTimeout(300);

		// banner shows the running quick task by name
		const banner = page.locator(".timer-banner");
		await expect(banner).toHaveClass(/active/);
		await expect(page.locator(".timer-habit")).toHaveText("E2E Quick Task");
		await expect(page.locator(".timer-text")).toContainText("m");

		// banner stop button appears for quick tasks
		const stopBtn = banner.getByRole("button", { name: "⏹ stop" });
		await expect(stopBtn).toBeVisible();
		await stopBtn.click();
		await page.waitForTimeout(300);

		// banner back to idle
		await expect(page.locator(".timer-habit")).toHaveCount(0);
		await expect(banner).not.toHaveClass(/active/);

		// no habit row was added
		expect(await page.locator(".habit-row").count()).toBe(beforeCount);
		await expect(page.locator(".habit-row").filter({ hasText: "E2E Quick Task" })).toHaveCount(0);
	});

	test("blocks habit timer start while a quick task is running", async ({ page }) => {
		// unique per run: fixed names accumulate across runs on a persistent dev DB
		const habitName = `E2E Block Habit ${Date.now()}`;

		// needs a timer habit to try to start
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);
		await page.getByRole("textbox", { name: "Name" }).fill(habitName);
		await page.getByRole("combobox", { name: "Type" }).selectOption("timer");
		await page.locator(".submit-btn").click();
		await page.locator(".dialog").waitFor({ state: "hidden" });
		await page.waitForTimeout(500);

		const habitRow = page.locator(".habit-row").filter({ hasText: habitName });
		const playBtn = habitRow.locator("button[aria-label='Start/stop timer']");

		// start a quick task
		await page.locator("button[title='Quick task timer — not added to habits']").click();
		await page.waitForTimeout(300);
		await page.getByPlaceholder("e.g. Buy groceries, Call mum...").fill("E2E Blocker Task");
		await page.getByRole("button", { name: "Start timer" }).click();
		await page.waitForTimeout(300);

		// habit start button is dimmed and inert
		await expect(playBtn).toHaveClass(/dimmed/);
		await playBtn.click();
		await page.waitForTimeout(300);
		await expect(page.locator(".timer-habit")).toHaveText("E2E Blocker Task");

		// stop the quick task, habit start works again
		await page.locator(".timer-banner").getByRole("button", { name: "⏹ stop" }).click();
		await page.waitForTimeout(300);
		await expect(playBtn).not.toHaveClass(/dimmed/);
		await playBtn.click();
		await page.waitForTimeout(300);
		await expect(page.locator(".timer-habit")).toHaveText(habitName);

		// clean up: stop the habit timer, archive the habit
		await habitRow.locator("button[aria-label='Start/stop timer']").click();
		await page.waitForTimeout(300);

		const deleteBtn = habitRow.locator("button[aria-label='Delete habit']");
		await deleteBtn.click();
		await page.waitForTimeout(500);
	});
});
