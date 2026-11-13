<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { loadAuth, authStore } from '$lib/stores/auth.js';
  import { initSync } from '$lib/stores/sync.js';
  import AuthShell from '$lib/components/AuthShell.svelte';

  let username = '';
  let password = '';
  let busy = false;
  let error = null;

  async function submit(e) {
    e?.preventDefault();
    busy = true;
    error = null;
    try {
      const res = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error || 'Login failed';
        return;
      }
      authStore.set({ authenticated: true, username: data.username });
      loadAuth();
      // The layout's onMount already ran pre-auth and bailed; the SPA goto
      // below never re-runs it, so start the websocket here or sync (incl.
      // timer:sync) never happens until a full page reload.
      initSync();
      goto(`${base}/`);
    } catch (e) {
      error = String(e);
    }
    busy = false;
  }
</script>

<AuthShell title="Sign in" subtitle="Welcome back. Pick up where you left off.">
  <form on:submit={submit} class="card">
    <label>
      <span>Username</span>
      <input class="field" bind:value={username} autocomplete="username" required autofocus />
    </label>
    <label>
      <span>Password</span>
      <input class="field" type="password" bind:value={password} autocomplete="current-password" required />
    </label>
    {#if error}
      <p class="err">{error}</p>
    {/if}
    <button class="btn" type="submit" disabled={busy}>{busy ? '…' : 'Sign in'}</button>
    <p class="alt">New here? <a href="{base}/register">Create an account</a></p>
  </form>
</AuthShell>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  label span {
    font-size: 12px;
    color: #8b90a6;
  }
  .field {
    background: #1e2030;
    border: 1px solid #454a60;
    border-radius: 9px;
    padding: 11px 12px;
    color: #cdd6f4;
    font-size: 14px;
  }
  .field:focus {
    outline: none;
    border-color: #cba6f7;
    box-shadow: 0 0 0 3px rgba(203, 166, 247, 0.12);
  }
  .btn {
    background: #cba6f7;
    border: none;
    border-radius: 9px;
    padding: 11px;
    color: #1e2030;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms, transform 140ms;
  }
  .btn:hover {
    background: #dcc9fb;
  }
  .btn:active {
    transform: scale(0.99);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .err {
    font-size: 12px;
    color: #f38ba8;
  }
  .alt {
    font-size: 12px;
    color: #6c7086;
    text-align: center;
    margin-top: 2px;
  }
  .alt a {
    color: #b4befe;
    text-decoration: none;
  }
  .alt a:hover {
    text-decoration: underline;
  }
</style>
