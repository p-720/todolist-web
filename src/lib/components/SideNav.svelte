<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { authStore, logout } from '$lib/stores/auth.js';

  export let activeTab = 'main';
  export let goalsBadge = 0;

  $: initial = ($authStore.username || '?').slice(0, 1).toUpperCase();

  async function signOut() {
    await logout();
    goto(`${base}/login`);
  }
</script>

<aside class="side-nav" aria-label="Primary">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="13" r="7.5"></circle>
        <path d="M12 9.5v4l2.4 2.2"></path>
        <path d="M9.5 2.5h5"></path>
      </svg>
    </span>
    <span class="brand-word">PomoTasker</span>
  </div>

  <nav class="side-links">
    <button class="side-link" class:active={activeTab === 'main'} on:click={() => activeTab = 'main'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18"></path>
        <path d="M3 12h18"></path>
        <path d="M3 18h18"></path>
      </svg>
      <span>Today</span>
    </button>

    <button class="side-link" class:active={activeTab === 'goals'} on:click={() => activeTab = 'goals'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <span>Goals</span>
      {#if goalsBadge > 0}
        <span class="side-badge">{goalsBadge}</span>
      {/if}
    </button>

    <button class="side-link" class:active={activeTab === 'stats'} on:click={() => activeTab = 'stats'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 20V10"></path>
        <path d="M12 20V4"></path>
        <path d="M6 20v-6"></path>
      </svg>
      <span>Statistics</span>
    </button>
  </nav>

  <div class="side-foot">
    <button class="side-utility" on:click={() => goto(`${base}/calendar`)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2"></rect>
        <path d="M16 2v4M8 2v4M3 10h18"></path>
      </svg>
      <span>Calendar</span>
    </button>

    <div class="side-user">
      <span class="avatar" aria-hidden="true">{initial}</span>
      <span class="user-name">{$authStore.username || 'Signed in'}</span>
      <button class="signout" title="Sign out" aria-label="Sign out" on:click={signOut}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <path d="M16 17l5-5-5-5"></path>
          <path d="M21 12H9"></path>
        </svg>
      </button>
    </div>
  </div>
</aside>

<style>
  .side-nav {
    display: none;
  }

  @media (min-width: 900px) {
    .side-nav {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 22px 18px 18px;
      background: #20202f;
      border: 1px solid #2f3347;
      border-radius: 20px;
      overflow: hidden;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 6px 24px;
    }

    .brand-mark {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: #cba6f7;
      color: #1e1e2e;
      flex-shrink: 0;
    }

    .brand-mark svg {
      width: 21px;
      height: 21px;
    }

    .brand-word {
      font-size: 15px;
      font-weight: 700;
      color: #e6e9f5;
      letter-spacing: -0.01em;
    }

    .side-links {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .side-link {
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      padding: 11px 12px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: #8b90a6;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background 140ms, color 140ms;
    }

    .side-link svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .side-link:hover {
      background: #262a3c;
      color: #cdd6f4;
    }

    .side-link.active {
      background: #2d2a4a;
      color: #dcc9fb;
    }

    .side-badge {
      margin-left: auto;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #f38ba8;
      color: #1e1e2e;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .side-foot {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 20px;
    }

    .side-utility {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border: none;
      border-radius: 9px;
      background: transparent;
      color: #6c7086;
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background 140ms, color 140ms;
    }

    .side-utility svg {
      width: 16px;
      height: 16px;
    }

    .side-utility:hover {
      background: #262a3c;
      color: #cdd6f4;
    }

    .side-user {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 12px 10px 4px;
      border-top: 1px solid #2f3347;
    }

    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #363a4f;
      color: #b4befe;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .user-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #a6adc8;
      font-size: 12px;
      font-weight: 600;
    }

    .signout {
      margin-left: auto;
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #6c7086;
      cursor: pointer;
      transition: background 140ms, color 140ms;
    }

    .signout svg {
      width: 16px;
      height: 16px;
    }

    .signout:hover {
      background: #363a4f;
      color: #f38ba8;
    }
  }
</style>
