<script>
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { groupsStore, habitsStore, weekDataStore } from '$lib/stores/timer.js';
  import { send } from '$lib/stores/sync.js';
  import TimerBanner from '$lib/components/TimerBanner.svelte';
  import HabitList from '$lib/components/HabitList.svelte';
  import WeekSummary from '$lib/components/WeekSummary.svelte';
  import AddHabitDialog from '$lib/components/AddHabitDialog.svelte';
  import AddGoalDialog from '$lib/components/AddGoalDialog.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import SideNav from '$lib/components/SideNav.svelte';
  import FabButton from '$lib/components/FabButton.svelte';
  import StatsView from '$lib/components/StatsView.svelte';
  import GoalsView from '$lib/components/GoalsView.svelte';
  import NoteEditor from '$lib/components/NoteEditor.svelte';
  import QuoteBanner from '$lib/components/QuoteBanner.svelte';
  import GoalsMini from '$lib/components/GoalsMini.svelte';

  let showAddDialog = false;
  let editingHabit = null;
  let activeTab = 'main';
  let showNoteEditor = false;
  let noteDate = '';
  let noteInitialContent = '';
  let showGoalDialog = false;
  let editingGoal = null;
  let goalsBadge = 0;

  $: pageTitle = activeTab === 'goals' ? 'Goals' : activeTab === 'stats' ? 'Statistics' : 'Today';
  $: todayLabel = dayjs().format('dddd, D MMMM');

  function getWeekRange() {
    const today = dayjs();
    const dayOfWeek = today.day();
    const monday = today.subtract((dayOfWeek + 6) % 7, 'day');
    const sunday = monday.add(6, 'day');
    return { startDate: monday.format('YYYY-MM-DD'), endDate: sunday.format('YYYY-MM-DD') };
  }

  let loadAttempts = 0;
  async function loadData() {
    const { startDate, endDate } = getWeekRange();
    try {
      const [tree, week] = await Promise.all([
        fetch(`${base}/api/habits`).then(r => r.ok ? r.json() : Promise.reject(new Error('habits ' + r.status))),
        fetch(`${base}/api/sessions?type=weekdata&startDate=${startDate}&endDate=${endDate}`).then(r => r.ok ? r.json() : Promise.reject(new Error('sessions ' + r.status))),
      ]);
      loadAttempts = 0;
      weekDataStore.set(week.rows);
      groupsStore.set(tree);
    } catch (err) {
      // The server may be restarting (deploy, boot-time migration) right
      // after login: retry with backoff instead of leaving the tab gray
      // until a manual refresh. Previous good data stays put on failure.
      loadAttempts = Math.min(loadAttempts + 1, 3);
      console.error(`loadData failed (attempt ${loadAttempts}):`, err);
      if (loadAttempts < 3) setTimeout(loadData, [2000, 5000, 10000][loadAttempts - 1]);
    }
  }

  function openAdd() {
    if (activeTab === 'goals') openAddGoalDialog();
    else openAddDialog();
  }

  function openAddDialog() {
    editingHabit = null;
    showAddDialog = true;
  }

  function openEditDialog(habit) {
    editingHabit = habit;
    showAddDialog = true;
  }

  function openAddGoalDialog() {
    editingGoal = null;
    showGoalDialog = true;
  }

  function openEditGoalDialog(goal) {
    editingGoal = goal;
    showGoalDialog = true;
  }

  async function afterAddGoal() {
    showGoalDialog = false;
  }

  async function archiveHabit(habit) {
    if (!confirm(`Archive ${habit.description}?`)) return;
    await fetch(`${base}/api/habits/${habit.id}/archive`, { method: 'POST' });
    send({ type: 'habits:update' });
    await loadData();
  }

  async function unarchiveHabit(habit) {
    await fetch(`${base}/api/habits/${habit.id}/unarchive`, { method: 'POST' });
    send({ type: 'habits:update' });
    await loadData();
  }

  async function permanentlyDeleteHabit(habit) {
    if (!confirm(`Permanently delete ${habit.description}? This cannot be undone.`)) return;
    await fetch(`${base}/api/habits/${habit.id}`, { method: 'DELETE' });
    send({ type: 'habits:update' });
    await loadData();
  }

  async function afterAddHabit() {
    showAddDialog = false;
    await loadData();
  }

  async function openNoteEditor(date) {
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    noteDate = targetDate;
    try {
      const res = await fetch(`${base}/api/notes?date=${targetDate}`);
      const data = await res.json();
      noteInitialContent = data.note?.content || '';
    } catch (e) {
      noteInitialContent = '';
    }
    showNoteEditor = true;
  }

  function closeNoteEditor() {
    showNoteEditor = false;
    noteInitialContent = '';
  }

  onMount(() => {
    loadData();
    const onSync = () => loadData();
    window.addEventListener('sync:habits', onSync);
    window.addEventListener('sync:sessions', onSync);

    // Notification tap → open the goal editor for that goal
    navigator.serviceWorker?.addEventListener('message', async (e) => {
      if (e.data?.type === 'goals:open') {
        activeTab = 'goals';
        if (e.data.goalId) {
          const res = await fetch(`${base}/api/goals/${e.data.goalId}`);
          if (res.ok) openEditGoalDialog(await res.json());
        }
      }
    });

    return () => {
      window.removeEventListener('sync:habits', onSync);
      window.removeEventListener('sync:sessions', onSync);
    };
  });

  function onGoalsOverdue(e) {
    goalsBadge = e.detail.count;
  }
</script>

<div class="app-container">
  <SideNav bind:activeTab {goalsBadge} />

  <aside class="focus-rail" class:rail-hidden={activeTab !== 'main'}>
    <div class="rail-block rail-focus">
      <p class="rail-title">Focus</p>
      <TimerBanner {habitsStore} />
    </div>
    <div class="rail-block rail-week">
      <WeekSummary {habitsStore} />
    </div>
    <div class="rail-block rail-goals">
      <GoalsMini onOpen={() => activeTab = 'goals'} />
    </div>
    <div class="rail-block rail-quote">
      <QuoteBanner />
    </div>
  </aside>

  <div class="main-panel">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="page-eyebrow">{todayLabel}</p>
        <h1>{pageTitle}</h1>
      </div>
      {#if activeTab !== 'stats'}
        <button class="page-action" on:click={openAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
          New {activeTab === 'goals' ? 'goal' : 'habit'}
        </button>
      {/if}
    </header>

    {#if activeTab === 'main'}
      <HabitList {groupsStore} onEdit={openEditDialog} onArchive={archiveHabit} onUnarchive={unarchiveHabit} onPermanentDelete={permanentlyDeleteHabit} onOpenNote={() => openNoteEditor()} />
    {:else if activeTab === 'goals'}
      <GoalsView on:overdue={onGoalsOverdue} on:edit={(e) => openEditGoalDialog(e.detail.goal)} />
    {:else}
      <StatsView on:editnote={(e) => openNoteEditor(e.detail.date)} />
    {/if}
  </div>

  <BottomNav bind:activeTab showFab={activeTab === 'main' || activeTab === 'goals'} {goalsBadge}>
    <svelte:fragment slot="fab">
      <FabButton onClick={activeTab === 'goals' ? openAddGoalDialog : openAddDialog} />
    </svelte:fragment>
  </BottomNav>

  {#if showAddDialog}
    <AddHabitDialog {editingHabit} on:close={() => showAddDialog = false} on:added={afterAddHabit} />
  {/if}

  {#if showGoalDialog}
    <AddGoalDialog {editingGoal} on:close={() => showGoalDialog = false} on:added={afterAddGoal} />
  {/if}

  {#if showNoteEditor}
    <NoteEditor date={noteDate} initialContent={noteInitialContent} on:saved={closeNoteEditor} on:close={closeNoteEditor} />
  {/if}
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    padding: 8px;
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 8px);
    box-sizing: border-box;
    overflow: hidden;
    overflow-x: hidden;
    min-width: 0;
  }

  .focus-rail {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;
  }

  .rail-quote { order: 1; }
  .rail-focus { order: 2; }
  .rail-week { order: 3; }
  .rail-goals { display: none; }

  .rail-title {
    display: none;
  }

  .main-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .page-head {
    display: none;
  }

  .rail-hidden {
    display: none;
  }

  @media (min-width: 900px) {
    .app-container {
      display: grid;
      grid-template-columns: 216px minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 16px 20px;
      height: 100vh;
      height: 100dvh;
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 20px 16px;
      padding-bottom: 20px;
      overflow: hidden;
    }

    .rail-hidden {
      display: grid;
    }

    :global(.side-nav) {
      grid-column: 1;
      grid-row: 1 / -1;
    }

    .focus-rail {
      grid-column: 2;
      grid-row: 1;
      display: grid;
      grid-template-columns: 1.05fr 0.95fr 1fr;
      gap: 14px;
      min-width: 0;
      align-items: start;
    }

    .rail-block {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .rail-goals {
      display: none;
    }

    .rail-focus { order: 0; }
    .rail-week { order: 0; }
    .rail-quote { order: 0; }

    .rail-focus :global(.timer-banner),
    .rail-quote :global(.quote-block),
    .rail-week :global(.week-card) {
      box-sizing: border-box;
    }

    .rail-focus :global(.timer-banner) {
      padding: 14px;
    }

    .rail-focus :global(.timer-big b) {
      font-size: 24px;
    }

    .rail-focus :global(.timer-display) {
      min-height: 44px;
    }

    .rail-focus :global(.timer-controls) {
      margin-top: 12px;
      gap: 6px;
    }

    .rail-focus :global(.mode-long) {
      display: none;
    }

    .rail-focus :global(.mode-short) {
      display: inline;
    }

    .rail-week :global(.week-card) {
      padding: 14px;
    }

    .rail-week :global(.week-card-head) {
      margin-bottom: 10px;
    }

    .rail-week :global(.week-metrics) {
      margin-bottom: 12px;
    }

    .rail-week :global(.week-bars) {
      height: 44px;
    }

    .rail-quote :global(.quote-block) {
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.45;
    }

    .rail-quote :global(.quote-text) {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .main-panel {
      grid-column: 2;
      grid-row: 2;
      min-height: 0;
      overflow: hidden;
    }

    .page-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding: 2px 0 18px;
      flex-shrink: 0;
    }

    .page-head-copy {
      min-width: 0;
    }

    .page-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6c7086;
      margin-bottom: 6px;
    }

    .page-head h1 {
      font-size: 28px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #e6e9f5;
    }

    .page-action {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 16px;
      border: none;
      border-radius: 10px;
      background: #cba6f7;
      color: #1e1e2e;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: background 140ms, transform 140ms;
      flex-shrink: 0;
    }

    .page-action:hover {
      background: #dcc9fb;
    }

    .page-action:active {
      transform: scale(0.97);
    }

    .page-action svg {
      width: 15px;
      height: 15px;
    }
  }

  @media (min-width: 1360px) {
    .app-container {
      grid-template-columns: 232px minmax(0, 1fr) 332px;
      grid-template-rows: minmax(0, 1fr);
      gap: 24px;
      padding: 22px 16px;
    }

    .focus-rail {
      grid-column: 3;
      grid-row: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      padding-right: 2px;
    }

    .rail-focus { order: 1; }
    .rail-week { order: 2; }
    .rail-goals { display: block; order: 3; }
    .rail-quote { order: 4; margin-top: auto; }

    .rail-title {
      display: block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6c7086;
      margin-bottom: 8px;
      padding-left: 2px;
    }

    .rail-focus :global(.timer-banner),
    .rail-quote :global(.quote-block),
    .rail-week :global(.week-card) {
      height: auto;
    }

    .rail-focus :global(.timer-banner) {
      padding: 18px;
    }

    .rail-focus :global(.mode-long) {
      display: inline;
    }

    .rail-focus :global(.mode-short) {
      display: none;
    }

    .rail-quote :global(.quote-text) {
      display: block;
      overflow: visible;
    }

    .main-panel {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (min-width: 1600px) {
    .app-container {
      grid-template-columns: 252px minmax(0, 1fr) 360px;
      gap: 28px;
      padding: 24px 16px;
    }
  }
</style>
