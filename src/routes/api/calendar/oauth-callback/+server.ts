import type { RequestHandler } from "@sveltejs/kit";
import { base } from "$app/paths";
import { text } from "@sveltejs/kit";
import { exchangeCode } from "$lib/server/calendar";
import { requireUser } from "$lib/server/auth";

// ?state carries the user id from getAuthUrl (the browser session may not be
// present in the redirect context, e.g. consent done in another profile).
// Falls back to the session user when state is absent.
export const GET = (async ({ url, request }) => {
	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");
	if (!code) {
		return text(callbackPage(`Connect failed: ${error || "no code"}`), { status: 500 });
	}
	let userId = Number(url.searchParams.get("state"));
	if (!Number.isInteger(userId) || userId <= 0) {
		const user = await requireUser(request).catch(() => null);
		if (!user) {
			return text(callbackPage("Connect failed: unknown user"), { status: 400 });
		}
		userId = user.id;
	}
	try {
		await exchangeCode(code, userId);
		return text(callbackPage(`Connected to Google Calendar. <a href="${base}/calendar">Continue</a>`));
	} catch (e) {
		return text(callbackPage(`Connect failed: ${msg(e)}`), { status: 500 });
	}
}) satisfies RequestHandler;

function callbackPage(html: string) {
	return `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#1e1e2e;color:#cdd6f4">${html} — redirecting…</body><script>setTimeout(()=>location.href='${base}/calendar',1500)</script></html>`;
}

function msg(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}
