<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { weekDataStore } from '$lib/stores/timer.js';

  export let habitsStore;

  let summary = '';
  let totalDone = 0;
  let perfectDays = 0;
  let rate = 0;
  let days = [];
  let weekLabel = '';

  function isDone(habit, row) {
    if (!row) return false;
    if (habit.habit_type === 'timer') return (row.duration_seconds || 0) > 0;
    if (habit.habit_type === 'boolean') return true;
    if (habit.habit_type === 'number') return (row.value ?? 0) >= (habit.min_value || 0);
    return false;
  }

  function computeSummary() {
    const allRows = get(weekDataStore);
    const habits = get(habitsStore);
    const totalHabits = habits.length;

    const today = dayjs();
    const monday = today.subtract((today.day() + 6) % 7, 'day');
    const todayIndex = (today.day() + 6) % 7;
    weekLabel = `${monday.format('D MMM')} – ${monday.add(6, 'day').format('D MMM')}`;

    const byDate = new Map();
    for (const row of allRows) {
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date).push(row);
    }

    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const nextDays = [];
    let doneTotal = 0;
    let perfect = 0;

    for (let i = 0; i < 7; i++) {
      const date = monday.add(i, 'day').format('YYYY-MM-DD');
      const rows = byDate.get(date) || [];
      let count = 0;
      for (const habit of habits) {
        const row = rows.find((r) => r.habit_id === habit.id);
        if (isDone(habit, row)) count++;
      }

      doneTotal += count;
      if (totalHabits > 0 && count === totalHabits) perfect++;

      const height = totalHabits > 0 ? Math.round((count / totalHabits) * 100) : 0;
      const doneText = count === totalHabits && totalHabits > 0
        ? `all ${totalHabits} habits done`
        : `${count} of ${totalHabits} habits done`;

      nextDays.push({
        letter: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        name: names[i],
        count,
        height: count > 0 ? Math.max(8, height) : 0,
        title: `${names[i]}: ${doneText}`,
        today: i === todayIndex,
      });
    }

    days = nextDays;
    totalDone = doneTotal;
    perfectDays = perfect;
    const elapsedDays = todayIndex + 1;
    rate = totalHabits > 0 ? Math.round((doneTotal / (totalHabits * elapsedDays)) * 100) : 0;
    summary = `${doneTotal} habits done, ${perfect} perfect ${perfect === 1 ? 'day' : 'days'}, ${rate}% completion`;
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
        <strong>{totalDone}</strong>
        <span>done</span>
      </div>
      <div class="week-metric">
        <strong>{perfectDays}</strong>
        <span>perfect days</span>
      </div>
      <div class="week-metric">
        <strong>{rate}<small>%</small></strong>
        <span>completion</span>
      </div>
    </div>
    <p class="week-bars-caption">Habits completed per day</p>
    <div class="week-bars" aria-hidden="true">
      {#each days as day}
        <div class="week-bar" title={day.title}>
          <div class="week-bar-track" class:is-today={day.today}>
            <div class="week-bar-fill" style="height: {day.height}%"></div>
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

    .week-bars-caption {
      font-size: 9px;
      color: #6c7086;
      margin-bottom: 6px;
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
      background: #2a2e3f;
      box-shadow: inset 0 0 0 1px rgba(203, 166, 247, 0.5);
    }

    .week-bar-fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 4px;
      background: #a6e3a1;
      transition: height 300ms ease;
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
