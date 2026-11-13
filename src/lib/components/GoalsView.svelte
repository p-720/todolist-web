<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { send } from '$lib/stores/sync.js';
  import { ensureGoalPush } from '$lib/stores/goal-push.js';
  import { perDay, progress, arrowFor } from '$lib/goal-math.js';

  const dispatch = createEventDispatcher();

  let goals = [];
  let showArchived = false;
  let archivedGoals = [];
  let pushEnabled = true; // optimistic: keep the banner hidden until a check proves otherwise
  let enabling = false;

  const today = () => dayjs().format('YYYY-MM-DD');

  function isOverdue(goal) {
    return goal.status === 'active' && goal.due_date < today();
  }

  function daysOverdue(goal) {
    return dayjs(today()).diff(dayjs(goal.due_date), 'day');
  }

  function formatDue(date) {
    const d = dayjs(date);
    return d.format('D MMM YYYY');
  }

  let activeGoals = [];
  let completedGoals = [];

  $: {
    activeGoals = goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => {
        const aOver = isOverdue(a);
        const bOver = isOverdue(b);
        if (aOver !== bOver) return aOver ? -1 : 1;
        return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
      });
    completedGoals = goals
      .filter((g) => g.status === 'completed')
      .sort((a, b) => (a.completed_at > b.completed_at ? -1 : 1));
  }

  let overdueCount = 0;
  $: overdueCount = goals.filter(isOverdue).length;
  $: dispatch('overdue', { count: overdueCount });

  async function load() {
    const res = await fetch(`${base}/api/goals`);
    goals = await res.json();
  }

  async function loadArchived() {
    const res = await fetch(`${base}/api/goals`);
    const all = await res.json();
    archivedGoals = all.filter((g) => g.status === 'archived');
  }

  function toggleShowArchived() {
    showArchived = !showArchived;
    if (showArchived) loadArchived();
  }

  async function checkPush() {
    if (typeof Notification === 'undefined') {
      pushEnabled = false;
      return;
    }
    if (Notification.permission === 'denied') {
      pushEnabled = false;
      return;
    }
    if (Notification.permission !== 'granted') {
      // User hasn't decided yet — only they can grant it (banner button)
      pushEnabled = null;
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushEnabled = false;
      return;
    }
    try {
      // Granted: (re)subscribe silently, no banner needed
      pushEnabled = await ensureGoalPush();
    } catch (e) {
      pushEnabled = false;
    }
  }

  async function enablePush() {
    enabling = true;
    try {
      const ok = await ensureGoalPush();
      pushEnabled = ok;
      if (ok) dispatch('pushstatus', { enabled: true });
    } finally {
      enabling = false;
    }
  }

  async function setStatus(goal, action) {
    if (action === 'archive' && !confirm(`Archive "${goal.title}"?`)) return;
    if (action === 'delete' && !confirm(`Permanently delete "${goal.title}"? This cannot be undone.`)) return;
    const method = action === 'delete' ? 'DELETE' : 'PATCH';
    await fetch(`${base}/api/goals/${goal.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: action === 'delete' ? undefined : JSON.stringify({ action }),
    });
    send({ type: 'goals:update' });
    await load();
    if (showArchived) loadArchived();
  }

  async function setValue(goal, value) {
    if (!Number.isInteger(value)) return;
    await fetch(`${base}/api/goals/${goal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'value', value }),
    });
    send({ type: 'goals:update' });
    await load();
  }

  function onCounterEdit(goal, raw) {
    if (raw === '') return;
    const v = Number(raw);
    if (Number.isInteger(v)) setValue(goal, v);
  }

  onMount(() => {
    load();
    checkPush();
    const onSync = () => load();
    window.addEventListener('sync:goals', onSync);
    return () => window.removeEventListener('sync:goals', onSync);
  });
</script>

<div class="goals-view">
  {#if pushEnabled === false || pushEnabled === null}
    <div class="push-banner">
      {#if pushEnabled === null}
        <span>Enable daily reminders?</span>
        <button class="push-btn" on:click={enablePush} disabled={enabling}>
          {enabling ? '…' : '🔔 Enable'}
        </button>
      {:else}
        <span>🔕 Daily reminders off</span>
        <button class="push-btn" on:click={enablePush} disabled={enabling}>
          {enabling ? '…' : 'Enable'}
        </button>
      {/if}
    </div>
  {/if}

  <div class="goal-section">
    <h3 class="section-title">Active</h3>
    {#each activeGoals as goal (goal.id)}
      <div class="goal-card" class:overdue={isOverdue(goal)}>
        <div class="card-top">
          <div class="goal-main">
            <div class="goal-title-line">
              <span class="goal-title">{goal.title}</span>
              {#if isOverdue(goal)}
                <span class="overdue-badge">Overdue by {daysOverdue(goal)}d</span>
              {/if}
            </div>
            {#if goal.description}
              <div class="goal-desc">{goal.description}</div>
            {/if}
            {#if goal.type === 'numbered'}
              <div class="counter-row">
                <button class="step-btn" on:click={() => setValue(goal, goal.current_value - 1)}>−</button>
                <input
                  class="counter-input"
                  type="number"
                  step="1"
                  value={goal.current_value}
                  on:change={(e) => onCounterEdit(goal, e.target.value)}
                />
                <button class="step-btn" on:click={() => setValue(goal, goal.current_value + 1)}>+</button>
                <span class="counter-target">→ {goal.target_value} {arrowFor(goal)}</span>
              </div>
            {/if}
            <div class="goal-due">
              {#if goal.type === 'numbered'}
                Due {formatDue(goal.due_date)} · {perDay(goal.current_value, goal.target_value, goal.due_date, today())}/day
              {:else}
                Due {formatDue(goal.due_date)}
              {/if}
            </div>
          </div>
          <div class="goal-actions">
            <button class="complete-btn" on:click={() => setStatus(goal, 'complete')}>Complete</button>
            <button class="edit-btn" on:click={() => dispatch('edit', { goal })}>Edit</button>
            <button class="archive-btn" title="Archive" on:click={() => setStatus(goal, 'archive')}>🗄</button>
          </div>
        </div>
        {#if goal.type === 'numbered'}
          <div class="progress-track">
            <div class="progress-fill" style="width: {Math.round(progress(goal.current_value, goal.start_value ?? goal.current_value, goal.target_value) * 100)}%"></div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty">No active goals. Tap + to add one.</div>
    {/each}
  </div>

  {#if completedGoals.length > 0}
    <div class="goal-section">
      <h3 class="section-title">Completed</h3>
      {#each completedGoals as goal (goal.id)}
        <div class="goal-card completed">
          <div class="card-top">
            <div class="goal-main">
              <div class="goal-title-line">
                <span class="goal-title">{goal.title}</span>
              </div>
              {#if goal.description}
                <div class="goal-desc">{goal.description}</div>
              {/if}
              <div class="goal-due">Completed</div>
            </div>
            <div class="goal-actions">
              <button class="reopen-btn" on:click={() => setStatus(goal, 'reopen')}>Reopen</button>
              <button class="delete-btn" title="Delete" on:click={() => setStatus(goal, 'delete')}>🗑</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if !showArchived}
    <button class="archive-toggle" on:click={toggleShowArchived}>📁 Show archived</button>
  {:else}
    <button class="archive-toggle back" on:click={toggleShowArchived}>← Back</button>
    {#if archivedGoals.length === 0}
      <div class="empty-archive">No archived goals</div>
    {:else}
      {#each archivedGoals as goal (goal.id)}
        <div class="goal-card archived">
          <div class="card-top">
            <div class="goal-main">
              <div class="goal-title-line">
                <span class="goal-title">{goal.title}</span>
              </div>
              {#if goal.description}
                <div class="goal-desc">{goal.description}</div>
              {/if}
              <div class="goal-due">Due {formatDue(goal.due_date)}</div>
            </div>
            <div class="goal-actions">
              <button class="reopen-btn" on:click={() => setStatus(goal, 'reopen')}>Restore</button>
              <button class="delete-btn" title="Delete" on:click={() => setStatus(goal, 'delete')}>🗑</button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .goals-view {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }

  .push-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #2a2e3f;
    border: 1px solid #454a60;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    color: #cdd6f4;
  }

  .push-btn {
    background: #b4befe;
    color: #1e1e2e;
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  .push-btn:disabled {
    opacity: 0.6;
  }

  .goal-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6c7086;
    margin: 8px 0 0;
  }

  .goal-card {
    background: #2a2e3f;
    border: 1px solid #363a4f;
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    flex: 1;
  }

  .counter-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .step-btn {
    border: none;
    background: #363a4f;
    color: #cdd6f4;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }

  .counter-input {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    color: #cdd6f4;
    font-size: 14px;
    width: 64px;
    padding: 5px 8px;
    text-align: center;
    -moz-appearance: textfield;
    appearance: textfield; /* no native spinners — the +/− buttons are ours */
  }

  .counter-input::-webkit-outer-spin-button,
  .counter-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .counter-input:focus {
    outline: none;
    border-color: #b4befe;
  }

  .counter-target {
    color: #a6adc8;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .progress-track {
    height: 4px;
    background: #363a4f;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #89b4fa;
    border-radius: 999px;
  }

  .goal-card.overdue {
    border-color: #f38ba8;
  }

  .goal-card.completed {
    opacity: 0.75;
  }

  .goal-main {
    min-width: 0;
    flex: 1;
  }

  .goal-title-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .goal-title {
    font-weight: 600;
    color: #cdd6f4;
    font-size: 14px;
  }

  .overdue-badge {
    background: #f38ba8;
    color: #1e1e2e;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
  }

  .goal-desc {
    color: #a6adc8;
    font-size: 13px;
    margin-top: 4px;
    white-space: pre-wrap;
  }

  .goal-due {
    color: #6c7086;
    font-size: 11px;
    margin-top: 6px;
  }

  .goal-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .complete-btn, .edit-btn, .archive-btn, .reopen-btn, .delete-btn {
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .complete-btn {
    background: #a6e3a1;
    color: #1e1e2e;
  }

  .edit-btn {
    background: #363a4f;
    color: #cdd6f4;
  }

  .archive-btn, .delete-btn {
    background: #363a4f;
    color: #f38ba8;
  }

  .reopen-btn {
    background: #363a4f;
    color: #fab387;
  }

  .archive-toggle {
    background: transparent;
    border: 1px dashed #363a4f;
    border-radius: 10px;
    padding: 10px;
    color: #6c7086;
    font-size: 13px;
    cursor: pointer;
  }

  .archive-toggle.back {
    text-align: left;
  }

  .empty, .empty-archive {
    color: #6c7086;
    font-size: 13px;
    padding: 12px;
    text-align: center;
  }

  @media (min-width: 900px) {
    .goals-view {
      padding: 0;
      gap: 16px;
    }

    .push-banner {
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 13px;
    }

    .goal-section {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 12px;
      align-items: start;
    }

    .section-title {
      grid-column: 1 / -1;
      font-size: 10px;
      letter-spacing: 0.12em;
      margin: 4px 0 2px;
    }

    .goal-card {
      background: #232636;
      border-color: #2f3347;
      border-radius: 14px;
      padding: 16px;
      gap: 10px;
      height: 100%;
    }

    .goal-card:hover {
      border-color: #3a3e55;
    }

    .goal-title {
      font-size: 15px;
      color: #e6e9f5;
    }

    .goal-desc {
      font-size: 13px;
      line-height: 1.5;
    }

    .goal-due {
      font-size: 11px;
    }

    .complete-btn, .edit-btn, .archive-btn, .reopen-btn, .delete-btn {
      padding: 7px 12px;
      font-size: 12px;
    }

    .counter-row {
      margin-top: 9px;
    }

    .step-btn {
      width: 32px;
      height: 32px;
    }

    .counter-input {
      padding: 6px 8px;
    }

    .archive-toggle {
      padding: 12px;
      font-size: 13px;
      border-radius: 12px;
    }

    .empty, .empty-archive {
      padding: 36px 12px;
    }
  }
</style>