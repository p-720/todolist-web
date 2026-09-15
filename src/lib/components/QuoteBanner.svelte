<script>
  import { base } from '$app/paths';
  import { send } from '$lib/stores/sync.js';
  import { onMount, onDestroy } from 'svelte';

  let quote = null;
  let editing = false;
  let content = '';
  let saving = false;

  // Keep habit-row drag disabled while the editor is open (same as NoteEditor)
  function setDialogCount(delta) {
    window._dialogCount = (window._dialogCount || 0) + delta;
    if (window._dialogCount > 0) {
      document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.dataset.wasDraggable = el.draggable;
        el.draggable = false;
      });
    } else {
      window._dialogCount = 0;
      document.querySelectorAll('[data-was-draggable="true"]').forEach(el => {
        el.draggable = true;
        delete el.dataset.wasDraggable;
      });
    }
  }

  async function load() {
    try {
      const res = await fetch(`${base}/api/quote`);
      quote = (await res.json()).quote;
    } catch (e) {
      quote = null;
    }
  }

  function openEditor() {
    if (editing) return;
    content = quote?.content || '';
    editing = true;
    setDialogCount(1);
  }

  function cancel() {
    if (!editing) return;
    editing = false;
    setDialogCount(-1);
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch(`${base}/api/quote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      quote = (await res.json()).quote;
      send({ type: 'quote:update' });
      editing = false;
      setDialogCount(-1);
    } catch (e) {
      console.error('Failed to save quote:', e);
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && editing) cancel();
  }

  function openOnKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openEditor();
    }
  }

  onMount(() => {
    load();
    const onSync = () => load();
    window.addEventListener('sync:quote', onSync);
    return () => {
      window.removeEventListener('sync:quote', onSync);
      if (editing) setDialogCount(-1);
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="quote-block" role="button" tabindex="0" aria-label="Edit quote" on:click={openEditor} on:keydown={openOnKey}>
  {#if quote}
    <span class="quote-text">❝ {quote.content}</span>
  {:else}
    <span class="quote-placeholder">❝ add a quote</span>
  {/if}
</div>

{#if editing}
  <div class="overlay" role="dialog" aria-modal="true" tabindex="-1" on:click|self={cancel}>
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">❝ Quote</span>
      </div>
      <textarea
        bind:value={content}
        placeholder="A quote to live by..."
        maxlength="300"
        rows="4"
      ></textarea>
      <div class="dialog-actions">
        <button class="cancel-btn" on:click={cancel}>Cancel</button>
        <button class="save-btn" on:click={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .quote-block {
    text-align: center;
    padding: 8px;
    margin-bottom: 8px;
    border: 1px dashed #363a4f;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.5;
    user-select: none;
    min-height: 0;
  }

  .quote-block:hover {
    background: #1e1e2e;
    border-color: #45495e;
  }

  .quote-text {
    color: #cdd6f4;
    font-style: italic;
  }

  .quote-placeholder {
    color: #6c7086;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
    pointer-events: auto;
  }

  .dialog {
    background: #232636;
    border: 1px solid #363a4f;
    border-radius: 12px;
    padding: 16px;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: auto;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-title {
    font-size: 14px;
    font-weight: 600;
    color: #cdd6f4;
  }

  textarea {
    background: #1e1e2e;
    border: 1px solid #363a4f;
    border-radius: 8px;
    padding: 10px;
    color: #cdd6f4;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }

  textarea:focus {
    outline: none;
    border-color: #b4befe;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .cancel-btn {
    background: none;
    border: 1px solid #363a4f;
    border-radius: 8px;
    color: #6c7086;
    font-size: 13px;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 150ms, color 150ms;
  }

  .cancel-btn:hover {
    background: #2a2e3f;
    color: #cdd6f4;
  }

  .save-btn {
    background: #a6e3a1;
    border: none;
    border-radius: 8px;
    color: #1e1e2e;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    transition: opacity 150ms;
  }

  .save-btn:hover {
    opacity: 0.9;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
