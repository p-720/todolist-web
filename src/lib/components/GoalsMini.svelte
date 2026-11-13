<script>
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { daysText, daysUntil, progress } from '$lib/goal-math.js';

  export let onOpen = null;

  let goals = [];
  const today = dayjs().format('YYYY-MM-DD');

  async function load() {
    try {
      const res = await fetch(`${base}/api/goals`);
      const all = await res.json();
      goals = all
        .filter((g) => g.status === 'active')
        .sort((a, b) => {
          const aOver = a.due_date < today;
          const bOver = b.due_date < today;
          if (aOver !== bOver) return aOver ? -1 : 1;
          return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
        })
        .slice(0, 3);
    } catch {
      goals = [];
    }
  }

  onMount(() => {
    load();
    const onSync = () => load();
    window.addEventListener('sync:goals', onSync);
    return () => window.removeEventListener('sync:goals', onSync);
  });
</script>

{#if goals.length > 0}
  <div class="goals-mini">
    <div class="mini-head">
      <span class="mini-title-head">Next up</span>
      <button on:click={() => onOpen?.()}>All goals</button>
    </div>
    <ul>
      {#each goals as goal (goal.id)}
        <li>
          <div class="mini-row">
            <span class="mini-title">{goal.title}</span>
            <span class="mini-due" class:overdue={goal.due_date < today}>
              {daysText(daysUntil(today, goal.due_date))}
            </span>
          </div>
          {#if goal.type === 'numbered'}
            <div class="mini-track">
              <div class="mini-fill" style="width: {Math.round(progress(goal.current_value, goal.start_value ?? goal.current_value, goal.target_value) * 100)}%"></div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .goals-mini {
    display: none;
  }

  @media (min-width: 1360px) {
    .goals-mini {
      display: block;
      background: #232636;
      border: 1px solid #2f3347;
      border-radius: 18px;
      padding: 18px;
    }

    .mini-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .mini-title-head {
      font-size: 13px;
      font-weight: 700;
      color: #cdd6f4;
    }

    .mini-head button {
      border: none;
      background: none;
      padding: 0;
      color: #8b90a6;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
    }

    .mini-head button:hover {
      color: #dcc9fb;
    }

    ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
    }

    .mini-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .mini-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cdd6f4;
      font-size: 12px;
      font-weight: 600;
    }

    .mini-due {
      flex-shrink: 0;
      color: #6c7086;
      font-size: 10px;
      white-space: nowrap;
    }

    .mini-due.overdue {
      color: #f38ba8;
    }

    .mini-track {
      height: 3px;
      margin-top: 6px;
      border-radius: 999px;
      background: #2a2e3f;
      overflow: hidden;
    }

    .mini-fill {
      height: 100%;
      border-radius: 999px;
      background: #89b4fa;
    }
  }
</style>
