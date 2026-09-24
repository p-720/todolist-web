import { test, expect } from "@playwright/test";

test("add-goal dialog: numbered row fits in dialog", async ({ page }) => {
	for (const width of [360, 420]) {
		await page.setViewportSize({ width, height: 800 });
		await page.goto("/pomotask");
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "Goals" }).click();
		await page.waitForTimeout(300);
		await page.getByRole("button", { name: "Add habit" }).click();
		await page.waitForTimeout(300);
		await page.locator(".dialog select").selectOption("numbered");
		await page.waitForTimeout(300);
		const m = await page.evaluate(() => {
			const dlg = document.querySelector(".dialog");
			const row = document.querySelector(".row2");
			const r1 = row.getBoundingClientRect();
			const r2 = dlg.getBoundingClientRect();
			return {
				rowRight: Math.round(r1.right),
				dialogRight: Math.round(r2.right),
				overflow: Math.round(r1.right - r2.right),
				scroll: dlg.scrollWidth - dlg.clientWidth,
			};
		});
		console.log(`  viewport ${width}px → rowRight ${m.rowRight} vs dialogRight ${m.dialogRight} → overflow ${m.overflow}px, scroll ${m.scroll}px`);
		expect(m.overflow).toBeLessThanOrEqual(0);
		expect(m.scroll).toBe(0);
		await page.locator(".cancel-btn").click();
		await page.waitForTimeout(300);
	}
});
