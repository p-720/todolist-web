<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { loadAuth, authStore } from '$lib/stores/auth.js';

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
      goto(`${base}/`);
    } catch (e) {
      error = String(e);
    }
    busy = false;
  }
</script>

<div class="wrap">
  <h1>PomoTasker</h1>
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
</div>

<style>
  .wrap {
    padding: 48px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  h1 {
    font-size: 20px;
    margin-bottom: 24px;
    color: #cba6f7;
  }
  .card {
    width: 100%;
    max-width: 320px;
    background: #232636;
    border: 1px solid #363a4f;
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-size: 12px;
    color: #6c7086;
  }
  .field {
    background: #1e2030;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 9px 11px;
    color: #cdd6f4;
    font-size: 14px;
  }
  .field:focus {
    outline: none;
    border-color: #cba6f7;
  }
  .btn {
    background: #cba6f7;
    border: none;
    border-radius: 8px;
    padding: 10px;
    color: #1e2030;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
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
  }
  .alt a {
    color: #cba6f7;
  }
</style>
