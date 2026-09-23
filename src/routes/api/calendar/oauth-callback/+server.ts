import type { RequestHandler } from "@sveltejs/kit";
import { base } from "$app/paths";
import { text } from "@sveltejs/kit";
import { exchangeCode } from "$lib/server/calendar";

export const GET = (async ({ url }) => {
	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");
	if (code) {
		try {
			await exchangeCode(code);
			return text(callbackPage(`Connected to Google Calendar. <a href="${base}/calendar">Continue</a>`));
		} catch (e) {
			return text(callbackPage(`Connect failed: ${msg(e)}`), { status: 500 });
		}
	}
	return text(callbackPage(`Connect failed: ${error || "no code"}`), { status: 500 });
}) satisfies RequestHandler;

function callbackPage(html: string) {
	return `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#1e1e2e;color:#cdd6f4">${html} — redirecting…</body><script>setTimeout(()=>location.href='${base}/calendar',1500)</script></html>`;
}

function msg(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}
