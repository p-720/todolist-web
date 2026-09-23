<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  let name = '';
  let inputEl = null;

  onMount(() => {
    window._dialogCount = (window._dialogCount || 0) + 1;
    inputEl?.focus();
  });

  onDestroy(() => {
    window._dialogCount = (window._dialogCount || 1) - 1;
  });

  function submit() {
    if (!name.trim()) return;
    dispatch('started', { name: name.trim() });
  }
</script>

<div class="overlay" on:click={() => dispatch('close')}></div>
<div class="dialog">
  <h2>Quick task</h2>
  <p class="hint">Timer only — not added to your habits. Tracks in Google Calendar.</p>
  <label>
    Task
    <input type="text" bind:this={inputEl} bind:value={name} placeholder="e.g. Buy groceries, Call mum..." on:keydown={(e) => e.key === 'Enter' && submit()} />
  </label>
  <div class="actions">
    <button class="cancel-btn" on:click={() => dispatch('close')}>Cancel</button>
    <button class="submit-btn" on:click={submit} disabled={!name.trim()}>Start timer</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 200;
  }
  .dialog {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 420px;
    background: #232636;
    border: 1px solid #363a4f;
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    z-index: 201;
  }
  h2 {
    font-size: 16px;
    color: #cdd6f4;
    margin-bottom: 4px;
  }
  .hint {
    font-size: 11px;
    color: #6c7086;
    margin-bottom: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 12px;
    color: #a6adc8;
  }
  input {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 10px 12px;
    color: #cdd6f4;
    font-size: 14px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .cancel-btn {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 8px 14px;
    color: #cdd6f4;
    font-size: 13px;
    cursor: pointer;
  }
  .cancel-btn:hover {
    background: #454a60;
  }
  .submit-btn {
    background: #cba6f7;
    border: 1px solid #cba6f7;
    border-radius: 8px;
    padding: 8px 14px;
    color: #1e2030;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
  }
  .submit-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
