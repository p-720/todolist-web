import { firefox } from "/run/current-system/sw/lib/node_modules/playwright/index.mjs";

const browser = await firefox.launch();
for (const width of [360, 420]) {
	const page = await browser.newPage({ viewport: { width, height: 800 } });
	await page.goto("http://localhost:5173/pomotask");
	await page.waitForTimeout(500);
	await page.locator('button[data-action="new"]').first().click();
	await page.waitForTimeout(300);
	await page.locator('.dialog select').selectOption('numbered');
	await page.waitForTimeout(300);
	const m = await page.evaluate(() => {
		const dlg = document.querySelector(".dialog");
		const row = document.querySelector(".row2");
		const r1 = row.getBoundingClientRect();
		const r2 = dlg.getBoundingClientRect();
		return {
			dialogClient: dlg.clientWidth,
			dialogScroll: dlg.scrollWidth,
			rowRight: Math.round(r1.right),
			dialogRight: Math.round(r2.right),
			overflow: Math.round(r1.right - r2.right),
		};
	});
	console.log(`viewport ${width}px →`, JSON.stringify(m), m.overflow <= 0 && m.dialogScroll === m.dialogClient ? "OK" : "OVERFLOW");
	await page.close();
}
await browser.close();
