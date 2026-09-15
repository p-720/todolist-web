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
  import FabButton from '$lib/components/FabButton.svelte';
  import StatsView from '$lib/components/StatsView.svelte';
  import GoalsView from '$lib/components/GoalsView.svelte';
  import NoteEditor from '$lib/components/NoteEditor.svelte';
  import QuoteBanner from '$lib/components/QuoteBanner.svelte';

  let showAddDialog = false;
  let editingHabit = null;
  let activeTab = 'main';
  let showNoteEditor = false;
  let noteDate = '';
  let noteInitialContent = '';
  let showGoalDialog = false;
  let editingGoal = null;
  let goalsBadge = 0;

  function getWeekRange() {
    const today = dayjs();
    const dayOfWeek = today.day();
    const monday = today.subtract((dayOfWeek + 6) % 7, 'day');
    const sunday = monday.add(6, 'day');
    return { startDate: monday.format('YYYY-MM-DD'), endDate: sunday.format('YYYY-MM-DD') };
  }

  async function loadData() {
    const { startDate, endDate } = getWeekRange();
    const [treeRes, data] = await Promise.all([
      fetch(`${base}/api/habits`).then(r => r.json()),
      fetch(`${base}/api/sessions?type=weekdata&startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
    ]);
    weekDataStore.set(data.rows);
    groupsStore.set(treeRes);
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
  {#if activeTab === 'main'}
    <QuoteBanner />
    <TimerBanner {habitsStore} />
    <WeekSummary {habitsStore} />
    <HabitList {groupsStore} onEdit={openEditDialog} onArchive={archiveHabit} onUnarchive={unarchiveHabit} onPermanentDelete={permanentlyDeleteHabit} onOpenNote={() => openNoteEditor()} />
  {:else if activeTab === 'goals'}
    <GoalsView on:overdue={onGoalsOverdue} on:edit={(e) => openEditGoalDialog(e.detail.goal)} />
  {:else}
    <StatsView on:editnote={(e) => openNoteEditor(e.detail.date)} />
  {/if}

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

<BottomNav bind:activeTab showFab={activeTab === 'main' || activeTab === 'goals'} {goalsBadge}>
  <svelte:fragment slot="fab">
    <FabButton onClick={activeTab === 'goals' ? openAddGoalDialog : openAddDialog} />
  </svelte:fragment>
</BottomNav>

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
</style>
