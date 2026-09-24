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

	test("running timer from another client shows after form login, no refresh", async ({ page, request }) => {
		// The Android app's exact complaint: log in (or reopen the app) while a
		// timer is already running on the server (started by rofi/polybar/the
		// phone's own service) — the running state must appear without any
		// manual refresh/pull-to-refresh.

		// 1) Log in via the API to get a JWT (also proves the fresh-db p720 user).
		const password = process.env.POMOTASK_TEST_PASSWORD;
		const loginRes = await request.post(`${BASE_URL}/api/auth`, {
			data: { action: "login", username: "p720", password },
			});
		expect(loginRes.ok(), `login failed: ${loginRes.status()}`).toBeTruthy();
		const setCookie = loginRes.headers()["set-cookie"];
		const jwt = setCookie?.match(/^pomo_token=([^;]*)/)?.[1];
		expect(jwt, "no pomo_token cookie").toBeTruthy();

		// 2) Start a running timer as a second client (raw ws with the JWT),
		//    like the phone's background service would.
		const { WebSocket: NodeWS } = await import("ws");
		const proto = new URL(BASE_URL).protocol === "https:" ? "wss:" : "ws:";
		const other = new NodeWS(`${proto}//${new URL(BASE_URL).host}/pomotask/ws?token=${jwt}`);
		await new Promise((res, rej) => {
			other.on("open", res);
			other.on("error", rej);
		});
		other.send(
			JSON.stringify({
				type: "timer:update",
				data: {
					running: true,
					activeHabitId: null,
					name: "Probe Task",
					mode: "stopwatch",
					elapsed: 0,
					startTime: Date.now(),
					elapsedBefore: 0,
				},
			}),
		);

		// 3) Cold login through the real form, exactly like the app does.
		await page.context().clearCookies();
		await page.goto(BASE_URL);
		await page.waitForURL(/\/login\/?$/, { timeout: 15000 });
		await page.getByLabel("Username").fill("p720");
		await page.getByLabel("Password").fill(password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL((u) => !String(u).endsWith("/login"), { timeout: 15000 });

		// 4) The running quick task must appear in the banner by itself.
		await expect(page.locator(".timer-banner").locator(".timer-habit")).toHaveText("Probe Task", {
			timeout: 15000,
		});
		await expect(page.locator(".timer-banner")).toHaveClass(/active/);

		// cleanup: stop the timer, close the second client
		other.send(JSON.stringify({ type: "timer:stop" }));
		other.close();
	});
});
