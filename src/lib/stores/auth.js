import { base } from "$app/paths";
import { writable, get } from "svelte/store";

// { authenticated, username } — set by the layout after probing /api/auth
export const authStore = writable({ authenticated: false, username: null });

export async function loadAuth() {
	try {
		const res = await fetch(`${base}/api/auth`);
		const data = await res.json();
		authStore.set({
			authenticated: !!data.authenticated,
			username: data.authenticated ? data.username : null,
		});
		return data.authenticated;
	} catch {
		authStore.set({ authenticated: false, username: null });
		return false;
	}
}

export async function logout() {
	await fetch(`${base}/api/auth/logout`, { method: "POST" }).catch(() => {});
	authStore.set({ authenticated: false, username: null });
}

export function username() {
	return get(authStore).username;
}
