<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { initSync, reconnect } from '$lib/stores/sync.js';
  import { loadAuth, authStore } from '$lib/stores/auth.js';

  let authed = $authStore.authenticated;

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${base}/sw/service-worker.js`).then(() => {
      if (navigator.serviceWorker.controller) return;
      return new Promise(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      });
    });
  }

  onMount(async () => {
    const isAuthPage = $page.url.pathname === `${base}/login` || $page.url.pathname === `${base}/register`;
    authed = await loadAuth();
    if (!authed && !isAuthPage) {
      goto(`${base}/login`);
      return;
    }

    if (authed) initSync();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reconnect();
        window.dispatchEvent(new CustomEvent('sync:habits'));
        window.dispatchEvent(new CustomEvent('sync:sessions'));
        window.dispatchEvent(new CustomEvent('sync:notes'));
        window.dispatchEvent(new CustomEvent('sync:goals'));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  });
</script>

<svelte:head>
  <title>PomoTasker</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#1e1e2e" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="{base}/manifest.json" />
  <link rel="apple-touch-icon" href="{base}/icons/icon-192.png" />
</svelte:head>

<main class="app">
  <slot />
</main>

<style>
  :global(:root) {
    --bg: #1e1e2e;
    --surface: #232636;
    --surface2: #2a2e3f;
    --border: #363a4f;
    --text: #cdd6f4;
    --text-dim: #6c7086;
    --blue: #89b4fa;
    --green: #a6e3a1;
    --lavender: #b4befe;
    --mauve: #cba6f7;
    --red: #f38ba8;
    --yellow: #f9e2af;
    --peach: #fab387;
  }

  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html) {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  :global(body) {
    min-height: 100vh;
  }

  .app {
    width: 100%;
    min-width: 0;
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--bg);
    overflow-x: hidden;
  }
</style>
