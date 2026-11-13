<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { send } from '$lib/stores/sync.js';

  const dispatch = createEventDispatcher();

  export let editingGoal = null;

  let title = editingGoal?.title || '';
  let description = editingGoal?.description || '';
  let dueDate = editingGoal?.due_date || dayjs().format('YYYY-MM-DD');
  let type = editingGoal?.type === 'numbered' ? 'numbered' : 'text';
  let startValue = editingGoal?.start_value ?? '';
  let targetValue = editingGoal?.target_value ?? '';

  onMount(() => {
    window._dialogCount = (window._dialogCount || 0) + 1;
    document.querySelectorAll('[draggable="true"]').forEach(el => {
      el.dataset.wasDraggable = el.draggable;
      el.draggable = false;
    });
  });
  onDestroy(() => {
    window._dialogCount--;
    if (!window._dialogCount) {
      document.querySelectorAll('[data-was-draggable="true"]').forEach(el => {
        el.draggable = true;
        delete el.dataset.wasDraggable;
      });
    }
  });

  async function submit() {
    if (!title.trim() || !dueDate) return;

    const body = {
      title: title.trim(),
      description: description.trim(),
      dueDate,
      type,
    };
    if (type === 'numbered') {
      const start = Number(startValue);
      const target = Number(targetValue);
      if (startValue === '' || !Number.isInteger(start) || !Number.isInteger(target)) return;
      body.startValue = start;
      body.targetValue = target;
    }
    const url = editingGoal
      ? `${base}/api/goals/${editingGoal.id}`
      : `${base}/api/goals`;
    const method = editingGoal ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      send({ type: 'goals:update' });
      dispatch('added');
    }
  }
</script>

<div class="overlay" on:click={() => dispatch('close')}></div>
<div class="dialog">
  <h2>{editingGoal ? 'Edit Goal' : 'Add Goal'}</h2>

  <label>
    Title
    <input type="text" bind:value={title} placeholder="e.g. Learn Rust, Finish thesis..." />
  </label>

  <label>
    Description
    <textarea rows="3" bind:value={description} placeholder="optional"></textarea>
  </label>

  <label>
    Due date
    <input type="date" bind:value={dueDate} />
  </label>

  <label>
    Type
    <select bind:value={type}>
      <option value="text">Text</option>
      <option value="numbered">Numbered</option>
    </select>
  </label>

  {#if type === 'numbered'}
    <div class="row2">
      <label>Start
        <input type="number" step="1" bind:value={startValue} placeholder="e.g. 12" />
      </label>
      <label>Target
        <input type="number" step="1" bind:value={targetValue} placeholder="e.g. 0" />
      </label>
    </div>
  {/if}

  <div class="actions">
    <button class="cancel-btn" on:click={() => dispatch('close')}>Cancel</button>
    <button class="submit-btn" on:click={submit}>{editingGoal ? 'Save' : 'Add'}</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 200;
    pointer-events: auto;
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
    pointer-events: auto;
  }

  h2 {
    font-size: 16px;
    color: #cdd6f4;
    margin-bottom: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  input, textarea, select {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 10px 12px;
    color: #cdd6f4;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
  }

  .row2 {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .row2 label {
    flex: 1;
    min-width: 0; /* allow shrinking below the number input's intrinsic width */
    margin-bottom: 0;
  }

  .row2 input {
    width: 100%;
    min-width: 0;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: #b4befe;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .cancel-btn, .submit-btn {
    flex: 1;
    border: none;
    border-radius: 10px;
    padding: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .cancel-btn {
    background: #363a4f;
    color: #6c7086;
  }

  .submit-btn {
    background: #b4befe;
    color: #1e1e2e;
  }

  @media (min-width: 900px) {
    .dialog {
      top: 50%;
      bottom: auto;
      transform: translate(-50%, -50%);
      border-radius: 16px;
      border-bottom: 1px solid #363a4f;
      max-width: 460px;
      padding-bottom: 20px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
  }
</style>