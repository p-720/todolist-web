import { error } from "@sveltejs/kit";
import * as core from "../../../auth-server.js";

export {
	hashPassword,
	verifyPassword,
	signUserToken,
	addUser,
	getUser,
	getUserByName,
	listApiKeys,
	createApiKey,
	deleteApiKey,
	findUserByApiKey,
	rateLimit,
	SESSION_COOKIE,
} from "../../../auth-server.js";

export const authenticateFromRequest = core.authenticateFromRequest;

/** Gate for /api/* routes: `const user = await requireUser(request)`
 *  (or the full SvelteKit event). Throws 401 when unauthenticated. */
export async function requireUser(ctx) {
	const req = ctx && ctx.request ? ctx.request : ctx;
	const user = await core.authenticateFromRequest({
		cookieHeader: req.headers.get("cookie") || undefined,
		authHeader: req.headers.get("authorization") || undefined,
	});
	if (!user) throw error(401, "Not authenticated");
	return user;
}
