<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { timerStore, weekDataStore, postCalendarEvent } from '$lib/stores/timer.js';
  import { send } from '$lib/stores/sync.js';
  import TimeEditor from './TimeEditor.svelte';
  import NumberEditor from './NumberEditor.svelte';

  export let habit;
  export let onEdit = null;
  export let onArchive = null;

  let circles = [];
  let activeTimer = null;
  let showTimeEditor = false;
  let editingCircle = null;
  let showNumberEditor = false;
  let editingNumber = null;
  let tick = 0;
  let longPressTimer = null;
  let wasLongPress = false;
  let touchMoved = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let suppressNextClick = false;

  const unsub = timerStore.subscribe(v => activeTimer = v);
  const weekDataUnsub = weekDataStore.subscribe(() => updateCircleData());

  onMount(() => {
    buildCircles();
    const interval = setInterval(() => tick = tick + 1, 1000);
    return () => {
      unsub();
      weekDataUnsub();
      clearInterval(interval);
    };
  });

  function buildCircles() {
    const today = dayjs();
    const dayOfWeek = today.day(); // 0=Sun
    const monday = today.subtract((dayOfWeek + 6) % 7, 'day').startOf('day');

    circles = [];
    for (let i = 0; i < 7; i++) {
      const date = monday.add(i, 'day');
      circles.push({
        date: date.format('YYYY-MM-DD'),
        dayLetter: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        isToday: i === ((dayOfWeek + 6) % 7),
        label: '',
        state: 'empty', // empty | partial | complete | active
      });
    }

    updateCircleData();
  }

  function updateCircleData() {
    const allRows = get(weekDataStore);
    const habitRows = allRows.filter(r => r.habit_id === habit.id);
    const sessionMap = {};
    for (const r of habitRows) {
      if (!sessionMap[r.date]) sessionMap[r.date] = [];
      sessionMap[r.date].push(r);
    }

    const newCircles = [];
    for (const circle of circles) {
      const daySessions = sessionMap[circle.date] || [];
      const data = processCircleData(habit, daySessions);
      newCircles.push({ ...circle, label: data.label, state: data.state });
    }
    circles = newCircles;
  }

  function formatDuration(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h`;
    if (mins > 0) return `${mins}m`;
    return `${totalSeconds}s`;
  }

  function processCircleData(habit, sessions) {
    if (habit.habit_type === 'timer') {
      let totalSeconds = 0;
      for (const s of sessions) totalSeconds += s.duration_seconds;
      const label = formatDuration(totalSeconds);
      if (totalSeconds > 0) return { label, state: 'complete' };
      return { label: '', state: 'empty' };
    }

    if (habit.habit_type === 'boolean') {
      if (sessions.length > 0) return { label: '✓', state: 'complete' };
      return { label: '', state: 'empty' };
    }

    if (habit.habit_type === 'number') {
      const val = sessions[0]?.value;
      if (val !== null && val !== undefined) {
        if (habit.min_value !== null && habit.min_value !== undefined && val >= habit.min_value) {
          return { label: String(val), state: 'complete' };
        }
        return { label: String(val), state: 'partial' };
      }
      return { label: '', state: 'empty' };
    }

    return { label: '', state: 'empty' };
  }

  function startLongPress(circle) {
    longPressTimer = setTimeout(async () => {
      wasLongPress = true;
      if (circle.isToday) {
        const res = await fetch(`${base}/api/sessions?type=seconds&habitId=${habit.id}&date=${circle.date}`);
        const data = await res.json();
        editingCircle = { ...circle, durationSeconds: data.durationSeconds };
        showTimeEditor = true;
      }
    }, 600);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function isCircleActive(circle) {
    return activeTimer?.activeHabitId === habit.id && activeTimer?.running && circle.isToday;
  }

  function onCircleClick(circle) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    handleCircleClick(circle);
  }

  async function handleCircleClick(circle) {
    if (wasLongPress) { wasLongPress = false; return; }
    if (habit.habit_type === 'timer') {
      openTimeEditor(circle);
    } else if (habit.habit_type === 'boolean') {
      toggleBoolean(habit.id, circle.date);
    } else if (habit.habit_type === 'number') {
      openNumberInput(habit, circle.date);
    }
  }

  function startTimer(habit) {
    timerStore.update(v => ({
      ...v,
      activeHabitId: habit.id,
      elapsed: 0,
      running: true,
      startTime: Date.now(),
      elapsedBefore: 0,
    }));
    // Timer habits: provisional end = their target duration. Others: 1-min
    // provisional (undefined) that the per-minute ticker extends, like quick tasks.
    postCalendarEvent({ id: habit.id, description: habit.description }, 'start', habit.habit_type === 'timer' ? habit.timer_duration_seconds : undefined);
    send({ type: 'timer:update', data: get(timerStore) });
  }

  async function stopTimer(habit) {
    const elapsed = getElapsed();
    const date = dayjs().format('YYYY-MM-DD');
    postCalendarEvent({ id: habit.id, description: habit.description }, 'stop', elapsed);

    await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        habitId: habit.id,
        date,
        durationSeconds: elapsed,
      }),
    });
    send({ type: 'sessions:update' });

    timerStore.update(v => ({
      ...v,
      activeHabitId: null,
      running: false,
      startTime: null,
      elapsedBefore: 0,
      elapsed: 0,
    }));
    send({ type: 'timer:update', data: get(timerStore) });

    const label = elapsed > 0 ? formatDuration(elapsed) : '';
    // Timer habits: their circle IS the session, mark it complete. Other types:
    // duration-only by design — the circle (check/value) stays as-is.
    if (habit.habit_type === 'timer') {
      circles = circles.map(c => c.date === date ? { ...c, state: elapsed > 0 ? 'complete' : 'empty', label } : c);
    }
  }

  function getElapsed() {
    if (!activeTimer?.startTime) return 0;
    const now = Date.now();
    const elapsed = Math.floor((now - activeTimer.startTime) / 1000) + activeTimer.elapsedBefore;
    return elapsed;
  }

  async function openTimeEditor(circle) {
    const res = await fetch(`${base}/api/sessions?type=seconds&habitId=${habit.id}&date=${circle.date}`);
    const data = await res.json();
    editingCircle = { ...circle, durationSeconds: data.durationSeconds };
    showTimeEditor = true;
  }

  function closeTimeEditor() {
    showTimeEditor = false;
    editingCircle = null;
  }

  async function toggleBoolean(habitId, date) {
    const res = await fetch(`${base}/api/sessions?type=has&habitId=${habitId}&date=${date}`);
    const data = await res.json();

    if (data.has) {
      await fetch(`${base}/api/sessions?date=${date}&habitId=${habitId}`, { method: 'DELETE' });
    } else {
      await fetch(`${base}/api/sessions?type=value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date, value: 1 }),
      });
    }
    send({ type: 'sessions:update' });

    const newState = data.has ? 'empty' : 'complete';
    const newLabel = data.has ? '' : '✓';
    circles = circles.map(c => c.date === date ? { ...c, state: newState, label: newLabel } : c);
  }

  async function openNumberInput(habit, date) {
    const current = await (await fetch(`${base}/api/sessions?type=value&habitId=${habit.id}&date=${date}`)).json();
    editingNumber = { date, value: current.value };
    showNumberEditor = true;
  }

  function closeNumberEditor() {
    showNumberEditor = false;
    editingNumber = null;
  }

  $: isActiveRow = activeTimer?.activeHabitId === habit.id && activeTimer?.running;
  $: rowClass = isActiveRow ? 'habit-row active' : 'habit-row';

  // One active timer at a time: while another (habit or quick task) runs, this row's start is blocked.
  $: otherTimerRunning = activeTimer?.running && activeTimer.activeHabitId !== habit.id;

  $: liveLabel = isActiveRow ? formatDuration(getElapsed()) : '';

  async function toggleTimerFromHeader() {
    if (activeTimer && activeTimer.activeHabitId === habit.id && activeTimer.running) {
      await stopTimer(habit);
    } else if (otherTimerRunning) {
      return;
    } else {
      startTimer(habit);
    }
  }

  $: playLabel = isActiveRow ? '⏹' : '▶';
</script>

<div class={rowClass}>
  <div class="habit-header">
    <span class="habit-desc">{habit.description}</span>
    <button class="edit-btn" class:dimmed={otherTimerRunning} on:click={toggleTimerFromHeader} aria-label="Start/stop timer">{playLabel}</button>
    <button class="edit-btn" on:click={() => onEdit?.(habit)} aria-label="Edit habit">✏️</button>
    <button class="edit-btn delete-btn" on:click={() => onArchive?.(habit)} aria-label="Delete habit">🗑</button>
  </div>
  <div class="circles-row">
    {#each circles as circle (circle.date)}
      <button
        class="circle {circle.state ? 'circle-' + circle.state : ''} {circle.isToday ? 'circle-today' : ''}"
        class:circle-active={isCircleActive(circle)}
        on:click={() => onCircleClick(circle)}
        on:contextmenu={(e) => {
        if (habit.habit_type !== 'timer' || !circle.isToday) return;
        e.preventDefault();
        openTimeEditor(circle);
      }}
        on:mousedown={(e) => {
        if (habit.habit_type !== 'timer' || !circle.isToday) return;
        e.preventDefault();
        startLongPress(circle);
      }}
        on:mouseup={cancelLongPress}
        on:mouseleave={cancelLongPress}
        on:touchstart={(e) => {
        if (habit.habit_type !== 'timer' || !circle.isToday) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;
        suppressNextClick = false;
        startLongPress(circle);
      }}
        on:touchmove={(e) => {
        if (!longPressTimer) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          touchMoved = true;
          cancelLongPress();
        }
      }}
        on:touchend={() => {
        cancelLongPress();
        if (habit.habit_type !== 'timer' || !circle.isToday) return;
        if (!wasLongPress && !touchMoved) {
          handleCircleClick(circle);
        }
        suppressNextClick = true;
        wasLongPress = false;
        touchMoved = false;
      }}
        on:touchcancel={() => {
        cancelLongPress();
        wasLongPress = false;
        touchMoved = false;
        suppressNextClick = false;
      }}
      >
        {circle.label || (isCircleActive(circle) ? liveLabel : circle.dayLetter)}
      </button>
    {/each}
  </div>
  {#if showTimeEditor && editingCircle}
    <TimeEditor
      habitId={habit.id}
      date={editingCircle.date}
      description={habit.description}
      durationSeconds={editingCircle.durationSeconds}
      onSaved={updateCircleData}
      onClosed={closeTimeEditor}
    />
  {/if}
  {#if showNumberEditor && editingNumber}
    <NumberEditor
      habitId={habit.id}
      date={editingNumber.date}
      description={habit.description}
      value={editingNumber.value}
      onSaved={updateCircleData}
      onClosed={closeNumberEditor}
    />
  {/if}
</div>

<style>
  .habit-row {
    padding: 10px 8px;
    margin: 4px 0;
    background: #232636;
    border: 1px solid #363a4f;
    border-radius: 12px;
    transition: background 100ms, box-shadow 100ms;
  }

  .habit-row.active {
    background: #2d2a4a;
    border: 1px solid #6c5c94;
    box-shadow: 0 0 12px rgba(203, 166, 247, 0.15);
  }

  .habit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .habit-desc {
    font-size: 13px;
    font-weight: 600;
    color: #e0e2e8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .edit-btn {
    background: none;
    border: none;
    color: #6c7086;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .edit-btn:hover {
    color: #cdd6f4;
  }

  .edit-btn.dimmed {
    opacity: 0.35;
    cursor: default;
  }

  .edit-btn.dimmed:hover {
    color: #6c7086;
  }

  .circles-row {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .circle {
    flex: 1 1 0;
    height: 38px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    border: none;
    border-radius: 8px;
    background: #363a4f;
    color: #6c7086;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, box-shadow 150ms;
  }

  .circle:hover {
    background: #454a60;
  }

  .circle-today {
    border: 2px solid #b4befe;
  }

  .circle-complete {
    background: #a6e3a1;
    color: #1e1e2e;
  }

  .circle-partial {
    background: #1e1e2e;
    color: #f9e2af;
    border: 2px solid #f9e2af;
  }

  .circle-active {
    background: #cba6f7;
    color: #1e1e2e;
    box-shadow: 0 0 12px rgba(203, 166, 247, 0.4);
  }
</style>
