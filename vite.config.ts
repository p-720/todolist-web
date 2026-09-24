import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: "pomotask-ws",
			// Wire the app websocket into the vite dev server so dev matches
			// prod (server.js does this on the production http server).
			// `passive` keeps us from destroying upgrades that belong to
			// vite's own HMR websocket.
			async configureServer(server) {
				if (!server.httpServer) return;
				const { initWebSocket } = await import("./ws-server.js");
				initWebSocket(server.httpServer, "/pomotask", { passive: true });
			},
		},
	],
	base: "/pomotask/",
	server: {
		host: true,
	},
});
