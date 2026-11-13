<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { weekDataStore } from '$lib/stores/timer.js';

  export let habitsStore;

  let summary = '';
  let sessions = 0;
  let minutes = 0;
  let pomos = 0;
  let days = [];
  let weekLabel = '';

  function computeSummary() {
    const allRows = get(weekDataStore);
    let totalSessions = 0;
    let totalSeconds = 0;
    for (const row of allRows) {
      totalSessions++;
      totalSeconds += row.duration_seconds || 0;
    }
    const totalPomos = totalSeconds / 1500;
    sessions = totalSessions;
    minutes = Math.floor(totalSeconds / 60);
    pomos = totalPomos;
    summary = `${totalSessions} sessions, ${minutes}m total, ${totalPomos.toFixed(1)} pomodoros`;

    const today = dayjs();
    const monday = today.subtract((today.day() + 6) % 7, 'day');
    weekLabel = `${monday.format('D MMM')} – ${monday.add(6, 'day').format('D MMM')}`;

    const totals = [0, 0, 0, 0, 0, 0, 0];
    for (const row of allRows) {
      const idx = dayjs(row.date).diff(monday, 'day');
      if (idx >= 0 && idx < 7) totals[idx] += Math.round((row.duration_seconds || 0) / 60);
    }
    const max = Math.max(...totals, 1);
    days = totals.map((mins, i) => ({
      letter: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
      mins,
      height: mins > 0 ? Math.max(8, Math.round((mins / max) * 100)) : 0,
      today: i === (today.day() + 6) % 7,
    }));
  }

  $: if ($habitsStore.length > 0) computeSummary();

  onMount(() => {
    return weekDataStore.subscribe(() => {
      if ($habitsStore.length > 0) computeSummary();
    });
  });
</script>

{#if summary}
  <div class="week-summary">{summary}</div>

  <div class="week-card">
    <div class="week-card-head">
      <span class="week-title">This week</span>
      <span>{weekLabel}</span>
    </div>
    <div class="week-metrics">
      <div class="week-metric">
        <strong>{sessions}</strong>
        <span>sessions</span>
      </div>
      <div class="week-metric">
        <strong>{minutes}<small>m</small></strong>
        <span>focused</span>
      </div>
      <div class="week-metric">
        <strong>{pomos.toFixed(1)}</strong>
        <span>pomodoros</span>
      </div>
    </div>
    <div class="week-bars" aria-hidden="true">
      {#each days as day}
        <div class="week-bar">
          <div class="week-bar-track" class:is-today={day.today}>
            <div class="week-bar-fill" class:is-today={day.today} style="height: {day.height}%"></div>
          </div>
          <span class:is-today={day.today}>{day.letter}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .week-summary {
    font-size: 11px;
    color: #6c7086;
    padding: 6px 12px;
    text-align: center;
  }

  .week-card {
    display: none;
  }

  @media (min-width: 900px) {
    .week-summary {
      display: none;
    }

    .week-card {
      display: block;
      background: #232636;
      border: 1px solid #2f3347;
      border-radius: 18px;
      padding: 18px;
    }

    .week-card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;
    }

    .week-title {
      font-size: 13px;
      font-weight: 700;
      color: #cdd6f4;
      letter-spacing: 0;
    }

    .week-card-head span {
      font-size: 10px;
      color: #6c7086;
      white-space: nowrap;
    }

    .week-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 16px;
    }

    .week-metric {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .week-metric strong {
      font-size: 19px;
      line-height: 1.1;
      font-weight: 700;
      color: #e6e9f5;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .week-metric strong small {
      font-size: 12px;
      color: #8b90a6;
      font-weight: 600;
    }

    .week-metric span {
      font-size: 10px;
      color: #6c7086;
    }

    .week-bars {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      height: 58px;
    }

    .week-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      min-width: 0;
      height: 100%;
    }

    .week-bar-track {
      position: relative;
      flex: 1;
      width: 100%;
      border-radius: 4px;
      background: #2a2e3f;
      overflow: hidden;
    }

    .week-bar-track.is-today {
      background: rgba(203, 166, 247, 0.16);
    }

    .week-bar-fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 4px;
      background: #4b4f66;
      transition: height 300ms ease;
    }

    .week-bar-fill.is-today {
      background: #cba6f7;
    }

    .week-bar span {
      font-size: 9px;
      font-weight: 600;
      color: #6c7086;
      line-height: 1;
    }

    .week-bar span.is-today {
      color: #dcc9fb;
    }
  }
</style>
