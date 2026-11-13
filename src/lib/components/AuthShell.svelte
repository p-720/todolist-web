<script>
  export let title = 'Sign in';
  export let subtitle = '';
</script>

<div class="auth-page">
  <aside class="auth-intro" aria-hidden="true">
    <div class="brand">
      <span class="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="13" r="7.5"></circle>
          <path d="M12 9.5v4l2.4 2.2"></path>
          <path d="M9.5 2.5h5"></path>
        </svg>
      </span>
      <span>PomoTasker</span>
    </div>

    <div class="intro-copy">
      <p class="eyebrow">Focus, tracked</p>
      <p class="intro-title">One quiet place for the work you keep meaning to do.</p>
      <p class="intro-sub">Pomodoro sessions, a week of habits and goals with a real date on them.</p>
    </div>

    <ul class="intro-list">
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="13" r="7.5"></circle>
          <path d="M12 9.5v4l2.4 2.2"></path>
          <path d="M9.5 2.5h5"></path>
        </svg>
        <span>Timer sessions that log themselves</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="2"></rect>
          <path d="M16 2v4M8 2v4M3 10h18"></path>
        </svg>
        <span>A seven-day habit grid at a glance</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 21V4"></path>
          <path d="M4 5h12l-2 4 2 4H4"></path>
        </svg>
        <span>Goals with progress and due dates</span>
      </li>
    </ul>

    <div class="intro-foot">
      <span class="intro-dot"></span>
      <span>Built for the work, not the busywork.</span>
    </div>
  </aside>

  <main class="auth-panel">
    <div class="auth-card">
      <header class="auth-head">
        <span class="mobile-brand">
          <span class="mobile-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="13" r="7.5"></circle>
              <path d="M12 9.5v4l2.4 2.2"></path>
              <path d="M9.5 2.5h5"></path>
            </svg>
          </span>
          PomoTasker
        </span>
        <h1>{title}</h1>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </header>
      <slot />
    </div>
  </main>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    justify-items: center;
    padding: 32px 20px;
    box-sizing: border-box;
  }

  .auth-intro {
    display: none;
  }

  .auth-panel {
    width: 100%;
    max-width: 360px;
  }

  .auth-card {
    width: 100%;
    background: #232636;
    border: 1px solid #363a4f;
    border-radius: 16px;
    padding: 22px;
    box-sizing: border-box;
  }

  .auth-head {
    margin-bottom: 20px;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    color: #cba6f7;
    font-size: 14px;
    font-weight: 700;
  }

  .mobile-mark {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: #cba6f7;
    color: #1e1e2e;
    flex-shrink: 0;
  }

  .mobile-mark svg {
    width: 16px;
    height: 16px;
  }

  .auth-head h1 {
    margin: 0;
    color: #e6e9f5;
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }

  .auth-head p {
    margin: 8px 0 0;
    color: #8b90a6;
    font-size: 13px;
    line-height: 1.5;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #e6e9f5;
    font-size: 15px;
    font-weight: 700;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: #cba6f7;
    color: #1e1e2e;
  }

  .brand-mark svg {
    width: 21px;
    height: 21px;
  }

  @media (min-width: 900px) {
    .auth-page {
      grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
      gap: 72px;
      align-items: center;
      justify-items: stretch;
      max-width: 1120px;
      margin: 0 auto;
      padding: 48px 40px;
    }

    .auth-intro {
      display: flex;
      flex-direction: column;
      min-height: 520px;
      padding: 8px 0;
    }

    .intro-copy {
      margin-top: auto;
      padding: 56px 0 36px;
    }

    .eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #cba6f7;
      margin-bottom: 16px;
    }

    .intro-title {
      font-size: 48px;
      line-height: 1.04;
      letter-spacing: -0.04em;
      color: #e6e9f5;
      max-width: 12ch;
      margin: 0;
    }

    .intro-sub {
      margin-top: 20px;
      max-width: 42ch;
      color: #8b90a6;
      font-size: 15px;
      line-height: 1.6;
    }

    .intro-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0 0 auto;
      padding: 0;
    }

    .intro-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #a6adc8;
      font-size: 13px;
    }

    .intro-list svg {
      width: 16px;
      height: 16px;
      color: #b4befe;
      flex-shrink: 0;
    }

    .intro-foot {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 28px;
      color: #6c7086;
      font-size: 11px;
    }

    .intro-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #a6e3a1;
    }

    .auth-panel {
      max-width: 420px;
      justify-self: end;
    }

    .auth-card {
      border-radius: 18px;
      padding: 30px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.2);
    }

    .auth-head {
      margin-bottom: 24px;
    }

    .mobile-brand {
      display: none;
    }

    .auth-head h1 {
      font-size: 28px;
    }

    .auth-head p {
      font-size: 14px;
    }
  }
</style>
