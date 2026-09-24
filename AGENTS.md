# ff

## Testing

### Prerequisites (once)
```bash
# Symlink @playwright/test to system nix store (avoids version conflicts)
ln -sf /nix/store/1i3ahl6fk8llj3f0qnpzmi6rvks5fxdi-playwright-test-1.59.1/lib/node_modules/@playwright/test node_modules/@playwright/test
```

### Run tests
```bash
# Terminal 1: start dev server
POMO_BASE='' npm run dev

# Terminal 2: run Playwright tests (fresh db is fine — the first login
# triggers the auth migration, which seeds the p720 user)
APP_URL=http://localhost:5173/pomotask \
POMOTASK_TEST_PASSWORD='...' \
/run/current-system/sw/bin/playwright test tests/pomotask.spec.js --project=firefox
```

Notes on auth (added with the multi-user rollout):
- Every `/api/*` route requires a session: login `POST /pomotask/api/auth`
  with `{action:"login",username,password}` sets a `pomo_token` cookie (JWT,
  1-year expiry, signing secret in `data/auth-secret`, mode 0600).
- Tests log in as `p720` (the migration owner); its password is only its
  scrypt hash in the code — pass the real one via `POMOTASK_TEST_PASSWORD`.
- The spec copies the API login's cookie into the browser context, since the
  Playwright `request` and `page` fixtures don't share cookies.

### Notes
- Uses system `playwright` (nix store), not `playwright-cli` or npm `@playwright/test`
- Dev server runs on `http://localhost:5173/pomotask` (SvelteKit base path)
- The dev server also serves the app websocket (`/pomotask/ws`, wired in
  `vite.config.ts`), so WS-dependent features can be tested in dev just like
  in the production build (`node server.js`).
- `find`/`grep` banned. Use `fd`/`rg` only.

## Android app

The Android app is a SEPARATE native Kotlin project at `/mnt/new/todolist-android`
(package `com.pomotasker.phone`, okhttp-based, talks to this app's API/WS).
This repo is the web server / PWA only — there is NO Capacitor here.

