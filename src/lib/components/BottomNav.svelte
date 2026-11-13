<script>
  export let activeTab = 'main';
  export let showFab = true;
  export let goalsBadge = 0;

  function setTab(tab) {
    activeTab = tab;
  }
</script>

<nav class="bottom-nav">
  <button
    class="nav-item"
    class:active={activeTab === 'main'}
    on:click={() => setTab('main')}
  >
    <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18"></path>
      <path d="M3 12h18"></path>
      <path d="M3 18h18"></path>
    </svg>
    <span class="nav-label">Main</span>
  </button>

  <button
    class="nav-item"
    class:active={activeTab === 'goals'}
    on:click={() => setTab('goals')}
  >
    <span class="nav-icon-wrap">
      <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      {#if goalsBadge > 0}
        <span class="nav-badge">{goalsBadge}</span>
      {/if}
    </span>
    <span class="nav-label">Goals</span>
  </button>

  <div class="fab-slot">
    {#if showFab}
      <slot name="fab"></slot>
    {/if}
  </div>

  <button
    class="nav-item"
    class:active={activeTab === 'stats'}
    on:click={() => setTab('stats')}
  >
    <svg class="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 20V10"></path>
      <path d="M12 20V4"></path>
      <path d="M6 20v-6"></path>
    </svg>
    <span class="nav-label">Statistics</span>
  </button>
</nav>

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(64px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: #232636;
    border-top: 1px solid #363a4f;
    display: flex;
    justify-content: space-around;
    align-items: center;
    z-index: 100;
    max-width: 480px;
    margin: 0 auto;
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 64px;
    border: none;
    background: transparent;
    color: #6c7086;
    cursor: pointer;
    transition: color 150ms;
  }

  .nav-item.active {
    color: #b4befe;
  }

  .nav-item:hover:not(.active) {
    color: #a6adc8;
  }

  .nav-icon {
    width: 22px;
    height: 22px;
  }

  .nav-label {
    font-size: 11px;
    font-weight: 500;
  }

  .nav-icon-wrap {
    position: relative;
    display: flex;
  }

  .nav-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #f38ba8;
    color: #1e1e2e;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .fab-slot {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 56px;
    flex-shrink: 0;
  }

  @media (min-width: 900px) {
    .bottom-nav {
      display: none;
    }
  }
</style>