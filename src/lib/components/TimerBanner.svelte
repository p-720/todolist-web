<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { timerStore } from '$lib/stores/timer.js';
  import { send } from '$lib/stores/sync.js';
  import QuickTaskDialog from './QuickTaskDialog.svelte';

  export let habitsStore;

  let activeTimer = null;
  let habits = [];
  let displayText = '0.0 pomodoros';
  let modeBtnText = 'S';
  let showQuickDialog = false;

  let calendarConnected = false;

  async function refreshCalendarStatus() {
    try {
      const res = await fetch(`${base}/api/calendar`);
      const s = await res.json();
      calendarConnected = !!(s.connected && s.calendarId);
    } catch (e) {
      calendarConnected = false;
    }
  }

  let timerInterval = null;
  let completing = false;

  // Notification
  let notifPermission = 'default';

  function requestNotifPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        notifPermission = perm;
      });
    } else {
      notifPermission = Notification.permission;
    }
  }

  async function showNotif(title, opts) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.log('Notification skipped: permission=' + (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
      return;
    }

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, opts);
      } else {
        new Notification(title, opts);
      }
      console.log('Notification shown:', title);
    } catch (err) {
      console.error('Notification error:', err);
      try {
        new Notification(title, opts);
        console.log('Notification shown (fallback):', title);
      } catch (fallbackErr) {
        console.error('Notification fallback failed:', fallbackErr);
      }
    }
  }

  function showStopNotif(habit, elapsed) {
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    showNotif('PomoTasker', {
      body: `Timer stopped: ${habit.description} (${mins}m ${secs}s)`,
      icon: `${base}/icons/icon-192.png`,
      tag: 'timer-stop',
      vibrate: [100, 50, 100],
      data: { type: 'timer-stop' },
    });
  }

  const tUnsub = timerStore.subscribe(v => {
    const wasRunning = activeTimer?.running;
    activeTimer = v;
    modeBtnText = v.mode === 'timed' ? 'P' : 'S';

    if (!wasRunning && v.running) {
      const habit = habits.find(h => h.id === v.activeHabitId);
      const label = habit ? habit.description : v.name;
      if (label) {
        showNotif('PomoTasker', {
          body: `Timer started: ${label}`,
          icon: `${base}/icons/icon-192.png`,
          tag: 'timer-start',
        });
      }
    }
  });

  const hUnsub = habitsStore.subscribe(v => habits = v);

  onMount(() => {
    timerInterval = setInterval(updateDisplay, 250);
    if (typeof Notification !== 'undefined') {
      notifPermission = Notification.permission;
    }
    refreshCalendarStatus();
    document.addEventListener('visibilitychange', refreshCalendarStatus);
    return () => {
      clearInterval(timerInterval);
      tUnsub();
      hUnsub();
      document.removeEventListener('visibilitychange', refreshCalendarStatus);
    };
  });

  function updateDisplay() {
    if (!activeTimer?.running) {
      displayText = '0.0 pomodoros';
      return;
    }

    const isQuick = activeTimer.activeHabitId == null && !!activeTimer.name;
    const habit = isQuick ? null : habits.find(h => h.id === activeTimer.activeHabitId);
    if (!habit && !isQuick) return;

    const elapsed = getElapsed();

    if (activeTimer.mode === 'timed') {
      const duration = 1500;
      const remaining = Math.max(0, duration - elapsed);
      const pomos = elapsed / duration;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;

      if (remaining === 0) {
        displayText = `${pomos.toFixed(1)} pomodoros (complete!)`;
        onPomodoroComplete();
      } else {
        displayText = `${pomos.toFixed(1)} pomodoros (${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')} left)`;
      }
    } else {
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      displayText = `${mins}m ${secs}s elapsed`;
    }
  }

  function getElapsed() {
    if (!activeTimer?.startTime) return activeTimer?.elapsedBefore || 0;
    return Math.floor((Date.now() - activeTimer.startTime) / 1000) + activeTimer.elapsedBefore;
  }

  async function stopTimer() {
    if (!activeTimer) return;
    const habit = activeTimer.activeHabitId != null ? habits.find(h => h.id === activeTimer.activeHabitId) : null;
    const quickName = activeTimer.activeHabitId == null ? activeTimer.name : null;
    const elapsed = await timerStore.stop();
    if (habit) {
      showStopNotif(habit, elapsed);
    } else if (quickName) {
      showStopNotif({ description: quickName }, elapsed);
    }
  }

  function openQuickDialog() {
    if (activeTimer?.running) return;
    showQuickDialog = true;
  }

  function startQuickTask(e) {
    showQuickDialog = false;
    timerStore.startQuick(e.detail?.name);
  }

  function toggleMode() {
    timerStore.update(v => ({
      ...v,
      mode: v.mode === 'timed' ? 'stopwatch' : 'timed',
    }));
    send({ type: 'timer:update', data: get(timerStore) });
  }

  async function onPomodoroComplete() {
    if (completing) return;
    completing = true;
    try {
      showNotif('Pomodoro complete!', {
        body: 'Pomodoro session finished!',
        icon: `${base}/icons/icon-192.png`,
        tag: 'pomodoro-done',
        vibrate: [200, 100, 200],
        data: { type: 'pomodoro-done' },
      });
      await stopTimer();
    } finally {
      completing = false;
    }
  }

  $: notifIcon = (() => {
    if (notifPermission === 'granted') return '🔔';
    if (notifPermission === 'denied') return '🔕';
    return '🔔?';
  })();
  $: isActive = activeTimer?.running;
  $: isQuickRunning = isActive && activeTimer?.activeHabitId == null && !!activeTimer.name;
  $: activeHabitName = activeTimer
    ? activeTimer.name || (activeTimer.activeHabitId ? habits.find(h => h.id === activeTimer.activeHabitId)?.description || '' : '')
    : '';
</script>

<div class="timer-banner {isActive ? 'active' : ''}">
  {#if activeHabitName}
    <div class="timer-habit">{activeHabitName}</div>
  {/if}
  <div class="timer-display">
    <span class="timer-text">{displayText}</span>
  </div>
  <div class="timer-controls">
    {#if isQuickRunning}
      <button class="mode-btn stop-btn" on:click={stopTimer}>⏹ stop</button>
    {/if}
    <button class="mode-btn" on:click={toggleMode}>{modeBtnText}</button>
    <button class="notif-btn" on:click={requestNotifPermission} title="Enable notifications">{notifIcon}</button>
    <button class="notif-btn quick-btn" class:dimmed={activeTimer?.running} on:click={openQuickDialog} title="Quick task timer — not added to habits">
      ⚡
    </button>
    <button class="notif-btn" on:click={() => goto(`${base}/calendar`)} title="Calendar tracking">
      <span class="cal-dot" class:cal-on={calendarConnected}>📅</span>
    </button>
  </div>
</div>

{#if showQuickDialog}
  <QuickTaskDialog on:close={() => showQuickDialog = false} on:started={startQuickTask} />
{/if}

<style>
  .timer-banner {
    background: #2a2e3f;
    border-radius: 12px;
    padding: 12px;
    margin: 4px 0;
    transition: border-color 150ms;
  }

  .timer-banner.active {
    border: 1px solid #cba6f7;
  }

  .timer-habit {
    font-size: 11px;
    color: #6c7086;
    margin-bottom: 4px;
  }

  .timer-display {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0;
  }

  .timer-text {
    font-size: 13px;
    font-weight: bold;
    color: #cdd6f4;
  }

  .timer-controls {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .mode-btn {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: bold;
    color: #cdd6f4;
    cursor: pointer;
  }

  .mode-btn:hover {
    background: #454a60;
  }

  .notif-btn {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .notif-btn:hover {
    background: #454a60;
  }

  .notif-btn.dimmed {
    opacity: 0.35;
    cursor: default;
  }

  .stop-btn {
    background: #f38ba8;
    border: 1px solid #f38ba8;
    color: #1e1e2e;
  }

  .stop-btn:hover {
    background: #f5a3bb;
  }

  .cal-dot {
    filter: grayscale(1) opacity(0.5);
  }

  .cal-dot.cal-on {
    filter: none;
  }

</style>
