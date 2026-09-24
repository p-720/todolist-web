<script>
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { logout } from '$lib/stores/auth.js';
  import { hideCompletedStore, weekDataStore } from '$lib/stores/timer.js';
  import HabitRow from './HabitRow.svelte';

  export let groupsStore;
  export let onEdit = null;
  export let onArchive = null;
  export let onUnarchive = null;
  export let onPermanentDelete = null;
  export let onOpenNote = null;

  let groups = [];
  let archivedHabits = [];
  let showArchived = false;
  let hideCompleted = false;
  let completedIds = {};
  let completedLoaded = false;
  let mounted = false;

  // Drag state
  let draggedType = null; // 'group' | 'habit'
  let draggedGroup = null;
  let draggedHabit = null;
  let dropTarget = null;
  let dropTargetType = null;
  let dropAfter = false;
  let dropProcessed = false;

  // Group editing
  let editingGroupId = null;
  let editingGroupName = '';
  let showGroupMenuId = null;
  let showIconColorId = null;

  // New group
  let showNewGroupInput = false;
  let newGroupName = '';

  const ICONS = ['', '🔥', '⭐', '💼', '🏠', '💤', '💪', '📚', '💻', '🎵', '🌱', '🎯', '⚡', '❤️', '🧠'];
  const COLORS = ['', '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#b4befe', '#cba6f7', '#eba0ac'];

  onMount(() => {
    mounted = true;
    const unsub = groupsStore.subscribe(v => { groups = v; });
    const unsubHide = hideCompletedStore.subscribe(v => hideCompleted = v);

    const handleSync = () => refresh();
    const handleSessionSync = () => checkCompleted();
    window.addEventListener('sync:habits', handleSync);
    window.addEventListener('sync:sessions', handleSessionSync);
    return () => {
      unsub();
      unsubHide();
      window.removeEventListener('sync:habits', handleSync);
      window.removeEventListener('sync:sessions', handleSessionSync);
    };
  });

  async function refresh() {
    if (showArchived) {
      const res = await fetch(`${base}/api/habits?archived=true`);
      archivedHabits = await res.json();
    } else {
      const res = await fetch(`${base}/api/habits`);
      const data = await res.json();
      groupsStore.set(data);
    }
  }

  function toggleShowArchived() {
    showArchived = !showArchived;
    if (showArchived) {
      hideCompleted = false;
      hideCompletedStore.set(false);
    }
    refresh();
  }

  function isHabitCompleted(habit, row) {
    if (!row) return false;
    if (habit.habit_type === 'boolean') return true;
    if (habit.habit_type === 'timer') return row.duration_seconds > 0;
    if (habit.habit_type === 'number') return (row.value ?? 0) >= (habit.min_value || 0);
    return false;
  }

  async function checkCompleted() {
    const today = dayjs().format('YYYY-MM-DD');
    const { startDate, endDate } = getWeekRange();
    const res = await fetch(`${base}/api/sessions?type=weekdata&startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();
    const allRows = data.rows || [];
    const flatHabits = groups.flatMap(g => g.habits);
    const results = {};
    for (const h of flatHabits) {
      const row = allRows.find(r => r.habit_id === h.id && r.date === today);
      results[h.id] = isHabitCompleted(h, row);
    }
    completedIds = results;
    completedLoaded = true;
    weekDataStore.set(allRows);
  }

  function getWeekRange() {
    const today = dayjs();
    const dayOfWeek = today.day();
    const monday = today.subtract((dayOfWeek + 6) % 7, 'day');
    const sunday = monday.add(6, 'day');
    return { startDate: monday.format('YYYY-MM-DD'), endDate: sunday.format('YYYY-MM-DD') };
  }

  async function toggleHideCompleted() {
    await checkCompleted();
    hideCompleted = !hideCompleted;
    hideCompletedStore.set(hideCompleted);
  }

  // --- Group actions ---

  async function toggleGroupCollapsed(group) {
    const newCollapsed = !group.collapsed;
    await fetch(`${base}/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed: newCollapsed ? 1 : 0 }),
    });
    await refresh();
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    await fetch(`${base}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    newGroupName = '';
    showNewGroupInput = false;
    await refresh();
  }

  function startEditGroup(group) {
    editingGroupId = group.id;
    editingGroupName = group.name;
    showGroupMenuId = null;
  }

  async function saveGroupName(group) {
    if (!editingGroupName.trim()) {
      editingGroupId = null;
      return;
    }
    await fetch(`${base}/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingGroupName.trim() }),
    });
    editingGroupId = null;
    await refresh();
  }

  async function deleteGroup(group) {
    if (!confirm(`Delete group "${group.name}"? Habits will move to General.`)) return;
    showGroupMenuId = null;
    await fetch(`${base}/api/groups/${group.id}`, { method: 'DELETE' });
    await refresh();
  }

  async function updateGroupIconColor(group, icon, color) {
    await fetch(`${base}/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon, color }),
    });
    await refresh();
  }

  // --- Drag & Drop ---

  function handleDragStart(type, item, event) {
    draggedType = type;
    if (type === 'group') draggedGroup = item;
    else draggedHabit = item;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(item.id));
    event.dataTransfer.setData(`application/x-${type}`, String(item.id));
  }

  function handleDragOver(type, item, event) {
    if (!draggedType) return;
    if (draggedType === 'group' && type !== 'group') return;
    if (draggedType === 'habit' && type === 'habit' && draggedHabit?.id === item.id) return;
    if (draggedType === 'group' && type === 'group' && draggedGroup?.id === item.id) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropTarget = item;
    dropTargetType = type;

    if (type === 'group') {
      if (draggedType === 'group') {
        const rect = event.currentTarget.getBoundingClientRect();
        dropAfter = event.clientY > rect.top + rect.height / 2;
      } else {
        dropAfter = false;
      }
    } else {
      const clientY = event.clientY;
      const rect = event.currentTarget.getBoundingClientRect();
      dropAfter = clientY > rect.top + rect.height / 2;
    }
  }

  async function handleDragEnd() {
    if (!dropProcessed && dropTarget) {
      await doDrop();
    }
    draggedType = null;
    draggedGroup = null;
    draggedHabit = null;
    dropTarget = null;
    dropTargetType = null;
    dropProcessed = false;
  }

  async function handleDrop(type, item, event) {
    event.preventDefault();
    if (!draggedType) return;
    dropProcessed = true;
    await doDrop();
  }

  async function doDrop() {
    const dt = draggedType;
    const dg = draggedGroup;
    const dh = draggedHabit;
    const target = dropTarget;
    const targetType = dropTargetType;
    const after = dropAfter;

    if (dt === 'group' && target && dg) {
      const targetGroup = target;
      if (dg.id === targetGroup.id) return;
      let newOrder;
      if (after) {
        const targetIndex = groups.findIndex(g => g.id === targetGroup.id);
        const nextGroup = groups[targetIndex + 1];
        newOrder = nextGroup ? nextGroup.order_index : (targetGroup.order_index + 1);
      } else {
        newOrder = targetGroup.order_index;
      }
      await fetch(`${base}/api/groups/${dg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_index: newOrder }),
      });
    } else if (dt === 'habit' && target && dh) {
      if (targetType === 'group') {
        const targetGroup = target;
        const maxOrder = targetGroup.habits.length > 0
          ? Math.max(...targetGroup.habits.map(h => h.order_index))
          : -1;
        const newOrder = maxOrder + 1;
        await fetch(`${base}/api/habits/${dh.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: targetGroup.id, order_index: newOrder }),
        });
      } else {
        const targetHabit = target;
        const targetGroupId = targetHabit.group_id;
        const targetGroup = groups.find(g => g.id === targetGroupId);
        const habitsInGroup = targetGroup?.habits ?? [];
        const targetIndex = habitsInGroup.findIndex(h => h.id === targetHabit.id);
        if (targetIndex === -1) return;

        let newOrder;
        if (after) {
          const nextHabit = habitsInGroup[targetIndex + 1];
          newOrder = nextHabit ? nextHabit.order_index : (targetHabit.order_index + 1);
        } else {
          newOrder = targetHabit.order_index;
        }
        await fetch(`${base}/api/habits/${dh.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: targetGroupId, order_index: newOrder }),
        });
      }
    }
    await refresh();
  }

  async function signOut() {
    await logout();
    goto(`${base}/login`);
  }

  $: visibleGroups = groups.map(g => {
    const visibleHabits = (hideCompleted && completedLoaded)
      ? g.habits.filter(h => !completedIds[h.id])
      : g.habits;
    return { ...g, visibleHabits, visibleCount: visibleHabits.length };
  }).filter(g => !hideCompleted || g.visibleCount > 0 || !completedLoaded);
</script>

<div class="habit-list">
  {#if mounted}
    <div class="habit-list-header">
      {#if !showArchived}
        <div class="header-left">
          <button class="add-group-btn" on:click={() => showNewGroupInput = true}>+ Group</button>
          <button class="note-btn" on:click={() => onOpenNote?.()}>📝 Note</button>
        </div>
        <div class="header-toggles">
          <button class="hide-toggle" class:active={hideCompleted} on:click={toggleHideCompleted}
            aria-label={hideCompleted ? 'Show all' : 'Hide done'}>
            {hideCompleted ? '👁️ Show all' : '🙈 Hide done'}
          </button>
          <button class="archive-toggle" on:click={toggleShowArchived}>
            📁 Show archived
          </button>
          <button class="archive-toggle" on:click={signOut} aria-label="Sign out">
            ⏻ Sign out
          </button>
        </div>
      {:else}
        <button class="archive-toggle back" on:click={toggleShowArchived}>
          🔙 Back to active
        </button>
      {/if}
    </div>
    {#if !showArchived && showNewGroupInput}
      <div class="new-group-row">
        <input type="text" bind:value={newGroupName} placeholder="Group name..." on:keydown={(e) => e.key === 'Enter' && createGroup()} />
        <button on:click={createGroup}>Add</button>
        <button on:click={() => { showNewGroupInput = false; newGroupName = ''; }}>Cancel</button>
      </div>
    {/if}
  {/if}
  <div class="habit-list-inner">
    {#if !showArchived}
      {#each visibleGroups as group (group.id)}
        {#if draggedType === 'group' && dropTarget && dropTarget.id === group.id && !dropAfter}
          <div class="drop-ghost">{draggedGroup.name}</div>
        {/if}

        <div class="group-section" class:drop-target={draggedType === 'group' && dropTarget && dropTarget.id === group.id} style={group.color ? `border-left: 3px solid ${group.color};` : ''}>
          <div class="group-header"
            draggable={true}
            on:dragstart={(e) => handleDragStart('group', group, e)}
            on:dragend={handleDragEnd}
            on:dragover|capture={(e) => handleDragOver('group', group, e)}
            on:drop|capture={(e) => handleDrop('group', group, e)}>
            <div class="group-drag-handle">⋮⋮</div>
            {#if group.icon}<span class="group-icon">{group.icon}</span>{/if}
            {#if editingGroupId === group.id}
              <input class="group-name-input" type="text" bind:value={editingGroupName} on:blur={() => saveGroupName(group)} on:keydown={(e) => e.key === 'Enter' && saveGroupName(group)} />
            {:else}
              <span class="group-name" on:click={() => toggleGroupCollapsed(group)}>{group.name}</span>
            {/if}
            <span class="group-count">({group.visibleCount})</span>
            <button class="group-chevron" on:click={() => toggleGroupCollapsed(group)}>
              {group.collapsed ? '▶' : '▼'}
            </button>
            <button class="group-menu-btn" on:click|stopPropagation={() => showGroupMenuId = showGroupMenuId === group.id ? null : group.id}>⋯</button>
          </div>

          {#if showGroupMenuId === group.id}
            <div class="group-menu">
              <button on:click={() => startEditGroup(group)}>Rename</button>
              <button on:click={() => { showIconColorId = showIconColorId === group.id ? null : group.id; showGroupMenuId = null; }}>Icon & Color</button>
              <button on:click={() => deleteGroup(group)}>Delete</button>
            </div>
          {/if}

          {#if showIconColorId === group.id}
            <div class="icon-color-picker">
              <div class="picker-row">
                {#each ICONS as icon}
                  <button class="picker-icon" class:active={group.icon === icon} on:click={() => updateGroupIconColor(group, icon, group.color)}>{icon || '○'}</button>
                {/each}
              </div>
              <div class="picker-row">
                {#each COLORS as color}
                  <button class="picker-color" class:active={group.color === color} style="background: {color || '#363a4f'}; border-color: {color || '#454a60'}" on:click={() => updateGroupIconColor(group, group.icon, color)}></button>
                {/each}
              </div>
            </div>
          {/if}

          {#if !group.collapsed}
            {#each group.visibleHabits as habit (habit.id)}
              {#if draggedType === 'habit' && dropTarget && dropTarget.id === habit.id && !dropAfter}
                <div class="drop-ghost">{draggedHabit.description}</div>
              {/if}
              <div class="habit-wrapper"
                class:dragging={draggedType === 'habit' && draggedHabit && draggedHabit.id === habit.id}
                class:drop-target={draggedType === 'habit' && dropTarget && dropTarget.id === habit.id}
                draggable={true}
                on:dragstart={(e) => handleDragStart('habit', habit, e)}
                on:dragend={handleDragEnd}
                on:dragover|capture={(e) => handleDragOver('habit', habit, e)}
                on:drop|capture={(e) => handleDrop('habit', habit, e)}
                aria-label={`Drag to reorder - ${habit.description}`}>
                <HabitRow {habit} {onEdit} {onArchive} />
                {#if draggedType === 'habit' && draggedHabit && draggedHabit.id === habit.id}
                  <div class="drag-ghost"></div>
                {/if}
                {#if draggedType === 'habit' && dropTarget && dropTarget.id === habit.id && dropAfter}
                  <div class="drop-ghost">{draggedHabit.description}</div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

        {#if draggedType === 'group' && dropTarget && dropTarget.id === group.id && dropAfter}
          <div class="drop-ghost">{draggedGroup.name}</div>
        {/if}
      {/each}
    {:else}
      {#if archivedHabits.length === 0}
        <div class="empty-archive">No archived habits</div>
      {:else}
        {#each archivedHabits as habit (habit.id)}
          <div class="archived-row">
            <div class="archived-info">
              <span class="archived-desc">{habit.description}</span>
              {#if habit.group_name}<span class="archived-group">{habit.group_name}</span>{/if}
            </div>
            <div class="archived-actions">
              <button class="unarchive-btn" on:click={() => onUnarchive?.(habit)}>Restore</button>
              <button class="perm-delete-btn" on:click={() => onPermanentDelete?.(habit)}>Delete</button>
            </div>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .habit-list {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 4px;
  }

  .habit-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px 4px;
    gap: 8px;
  }

  .header-left {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .header-toggles {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .add-group-btn {
    background: none;
    border: 1px solid #363a4f;
    border-radius: 8px;
    color: #6c7086;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .add-group-btn:hover {
    background: #2a2e3f;
    color: #cdd6f4;
  }

  .note-btn {
    background: none;
    border: 1px solid #363a4f;
    border-radius: 8px;
    color: #6c7086;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .note-btn:hover {
    background: #2a2e3f;
    color: #cdd6f4;
  }

  .hide-toggle {
    background: none;
    border: 1px solid #363a4f;
    border-radius: 8px;
    color: #6c7086;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .hide-toggle:hover {
    background: #2a2e3f;
    color: #cdd6f4;
  }

  .hide-toggle.active {
    background: #363a4f;
    color: #cdd6f4;
    border-color: #b4befe;
  }

  .archive-toggle {
    background: none;
    border: 1px solid #363a4f;
    border-radius: 8px;
    color: #6c7086;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .archive-toggle:hover {
    background: #2a2e3f;
    color: #cdd6f4;
  }

  .archive-toggle.back {
    margin-left: auto;
  }

  .new-group-row {
    display: flex;
    gap: 6px;
    padding: 0 4px 8px;
    align-items: center;
  }

  .new-group-row input {
    flex: 1;
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    padding: 6px 10px;
    color: #cdd6f4;
    font-size: 13px;
  }

  .new-group-row button {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    color: #cdd6f4;
    font-size: 12px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .new-group-row button:hover {
    background: #454a60;
  }

  .habit-list-inner {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .empty-archive {
    text-align: center;
    color: #6c7086;
    font-size: 13px;
    padding: 24px 0;
  }

  .archived-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 8px;
    margin: 4px 0;
    background: #232636;
    border: 1px solid #363a4f;
    border-radius: 12px;
    opacity: 0.7;
  }

  .archived-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .archived-desc {
    font-size: 13px;
    font-weight: 600;
    color: #e0e2e8;
  }

  .archived-group {
    font-size: 10px;
    color: #6c7086;
  }

  .archived-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .unarchive-btn, .perm-delete-btn {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 8px;
    color: #cdd6f4;
    font-size: 11px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .unarchive-btn:hover {
    background: #454a60;
  }

  .perm-delete-btn {
    color: #f38ba8;
    border-color: #f38ba8;
  }

  .perm-delete-btn:hover {
    background: #f38ba8;
    color: #1e1e2e;
  }

  .group-section {
    margin-bottom: 8px;
    border-radius: 8px;
    background: rgba(255,255,255,0.01);
  }

  .group-section.drop-target {
    background: rgba(180, 190, 254, 0.06);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
    cursor: grab;
    user-select: none;
    border-radius: 8px;
    transition: background 150ms;
  }

  .group-header:hover {
    background: rgba(255,255,255,0.03);
  }

  .group-header:active {
    cursor: grabbing;
  }

  .group-drag-handle {
    color: #6c7086;
    font-size: 10px;
    letter-spacing: -1px;
    cursor: grab;
    padding: 2px;
  }

  .group-icon {
    font-size: 14px;
    line-height: 1;
  }

  .group-name {
    font-size: 13px;
    font-weight: 700;
    color: #a6adc8;
    flex: 1;
    cursor: pointer;
  }

  .group-name-input {
    flex: 1;
    background: #363a4f;
    border: 1px solid #b4befe;
    border-radius: 6px;
    padding: 4px 8px;
    color: #cdd6f4;
    font-size: 13px;
    font-weight: 700;
  }

  .group-count {
    font-size: 11px;
    color: #6c7086;
  }

  .group-chevron {
    background: none;
    border: none;
    color: #6c7086;
    font-size: 10px;
    cursor: pointer;
    padding: 2px 4px;
  }

  .group-menu-btn {
    background: none;
    border: none;
    color: #6c7086;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
  }

  .group-menu {
    display: flex;
    gap: 6px;
    padding: 4px 8px 8px;
    margin-left: 20px;
  }

  .group-menu button {
    background: #363a4f;
    border: 1px solid #454a60;
    border-radius: 6px;
    color: #cdd6f4;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .group-menu button:hover {
    background: #454a60;
  }

  .icon-color-picker {
    padding: 8px;
    margin: 0 4px 8px;
    background: #1e1e2e;
    border: 1px solid #363a4f;
    border-radius: 8px;
  }

  .picker-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }

  .picker-row:last-child {
    margin-bottom: 0;
  }

  .picker-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #454a60;
    background: #363a4f;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    cursor: pointer;
    color: #cdd6f4;
  }

  .picker-icon.active {
    border-color: #b4befe;
    background: #454a60;
  }

  .picker-color {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .picker-color.active {
    border-color: #cdd6f4;
    box-shadow: 0 0 0 2px #1e1e2e;
  }

  .habit-wrapper {
    cursor: grab;
    user-select: none;
    position: relative;
    transition: background 200ms ease;
  }

  .habit-wrapper:hover {
    background: rgba(255,255,255,0.02);
  }

  .habit-wrapper:active {
    cursor: grabbing;
  }

  .habit-wrapper.dragging {
    opacity: 0.25;
  }

  .habit-wrapper.drop-target {
    background: rgba(180, 190, 254, 0.08);
  }

  .drag-ghost {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.15;
    background: #b4befe;
    border-radius: 8px;
    border: 1px solid rgba(180, 190, 254, 0.3);
  }

  .drop-ghost {
    padding: 8px 12px;
    margin: 4px 0;
    background: rgba(180, 190, 254, 0.1);
    border: 1px dashed rgba(180, 190, 254, 0.4);
    border-radius: 8px;
    color: #b4befe;
    font-size: 14px;
    pointer-events: none;
    opacity: 0.7;
  }
</style>
