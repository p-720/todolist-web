<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';

  let status = null;
  let calendars = null;
  let selectedId = '';
  let clientId = '';
  let clientSecret = '';
  let busy = false;
  let error = null;

  async function loadStatus() {
    try {
      status = await (await fetch(`${base}/api/calendar`)).json();
      if (status.connected) {
        selectedId = status.calendarId || '';
        loadCalendars();
      }
    } catch (e) {
      error = 'cannot reach calendar api: ' + e;
    }
  }

  async function loadCalendars() {
    try {
      const res = await fetch(`${base}/api/calendar?list=1`);
      const data = await res.json();
      calendars = data.calendars;
      if (!calendars) error = data.error || 'failed to list calendars';
    } catch (e) {
      error = 'failed to list calendars: ' + e;
    }
  }

  async function saveCreds() {
    busy = true;
    error = null;
    try {
      await fetch(`${base}/api/calendar?action=creds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      clientId = '';
      clientSecret = '';
      await loadStatus();
    } catch (e) {
      error = String(e);
    }
    busy = false;
  }

  async function connect() {
    busy = true;
    error = null;
    try {
      const res = await fetch(`${base}/api/calendar?connect=1`);
      const data = await res.json();
      if (!data.authUrl) {
        error = data.reason || 'cannot build auth url';
        busy = false;
        return;
      }
      window.location.href = data.authUrl;
    } catch (e) {
      error = String(e);
      busy = false;
    }
  }

  async function saveCalendar() {
    if (!selectedId) return;
    const cal = calendars?.find((c) => c.id === selectedId);
    await fetch(`${base}/api/calendar?action=select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: selectedId, calendarName: cal?.summary }),
    });
    await loadStatus();
  }

  async function disconnect() {
    if (!confirm('Disconnect Google Calendar?')) return;
    await fetch(`${base}/api/calendar?action=disconnect`, { method: 'POST' });
    calendars = null;
    await loadStatus();
  }

  onMount(loadStatus);
</script>

<div class="page">
  <h1>Calendar tracking</h1>
  <p class="sub">Timer start/stop creates a live event in your Google Calendar.</p>

  {#if error}
    <div class="box error">{error}</div>
  {/if}

  {#if !status}
    <p class="sub">loading…</p>
  {:else if !status.connected}
    <div class="box">
      <h2>{status.hasCreds ? 'Connect your Google account' : '1. Add OAuth client credentials'}</h2>
      {#if !status.hasCreds}
        <ol>
          <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console → Credentials → Create credentials → OAuth client ID</a></li>
          <li>Type: <b>Web application</b></li>
          <li>Authorized redirect URI: <code>{status.redirectUri}</code></li>
          <li>Copy the client ID and client secret below</li>
        </ol>
      {:else}
        <p class="sub">Credentials saved — connect below, or replace them in the form.</p>
      {/if}
      <input class="field" placeholder="Client ID" bind:value={clientId} />
      <input class="field" type="password" placeholder="Client secret" bind:value={clientSecret} />
      <button class="btn" on:click={saveCreds} disabled={busy || !clientId || !clientSecret}>Save credentials</button>
    </div>
    {#if status.hasCreds}
      <div class="box">
        <button class="btn primary" on:click={connect} disabled={busy}>Connect to Google</button>
      </div>
    {/if}
  {:else}
    <div class="box">
      <h2>Connected {status.calendarName ? `→ ${status.calendarName}` : ''}</h2>
      {#if status.lastError}
        <div class="err-line">last error: {status.lastError} {status.lastErrorAt}</div>
      {:else}
        <div class="ok-line">calendar: {status.calendarId ? 'tracking on' : 'pick a calendar below'}</div>
      {/if}
      {#if calendars}
        <h3>Pick calendar</h3>
        {#each calendars as cal}
          <label class="cal-row">
            <input type="radio" name="cal" value={cal.id} bind:group={selectedId} />
            <span>{cal.summary}</span>
          </label>
        {/each}
        <button class="btn" on:click={saveCalendar} disabled={!selectedId}>Save calendar</button>
      {/if}
      <button class="btn danger" on:click={disconnect}>Disconnect</button>
    </div>
  {/if}
</div>

<style>
  .page {
    padding: 16px;
    max-width: 560px;
    margin: 0 auto;
    color: #cdd6f4;
  }
  h1 {
    font-size: 18px;
    margin: 8px 0 4px;
  }
  h2 {
    font-size: 14px;
    margin: 8px 0;
  }
  h3 {
    font-size: 12px;
    margin: 12px 0 4px;
    color: #a6adc8;
  }
  .sub {
    font-size: 12px;
    color: #6c7086;
  }
  .box {
    background: #2a2e3f;
    border-radius: 12px;
    padding: 16px;
    margin-top: 12px;
  }
  .box.error {
    border: 1px solid #f38ba8;
  }
  ol {
    font-size: 12px;
    color: #a6adc8;
    padding-left: 18px;
  }
  ol a {
    color: #cba6f7;
  }
  code {
    background: #1e2030;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
    word-break: break-all;
  }
  .field {
    width: 100%;
    box-sizing: border-box;
    background: #1e2030;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 8px 10px;
    color: #cdd6f4;
    font-size: 13px;
    margin: 6px 0;
  }
  .btn {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 8px 14px;
    color: #cdd6f4;
    font-size: 13px;
    cursor: pointer;
    margin-top: 8px;
  }
  .btn:hover:not(:disabled) {
    background: #454a60;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.primary {
    background: #cba6f7;
    color: #1e2030;
    border-color: #cba6f7;
  }
  .btn.danger {
    background: transparent;
    border-color: #f38ba8;
    color: #f38ba8;
  }
  .cal-row {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    padding: 4px 0;
  }
  .err-line {
    font-size: 11px;
    color: #f38ba8;
    word-break: break-word;
  }
  .ok-line {
    font-size: 11px;
    color: #a6e3a1;
  }
</style>
