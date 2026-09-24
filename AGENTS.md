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

# Terminal 2: run Playwright tests
APP_URL=http://localhost:5173/pomotask /run/current-system/sw/bin/playwright test tests/pomotask.spec.js --project=firefox
```

### Notes
- Uses system `playwright` (nix store), not `playwright-cli` or npm `@playwright/test`
- Dev server runs on `http://localhost:5173/pomotask` (SvelteKit base path)
- `find`/`grep` banned. Use `fd`/`rg` only.

## Android app

The Android app is a SEPARATE native Kotlin project at `/mnt/new/todolist-android`
(package `com.pomotasker.phone`, okhttp-based, talks to this app's API/WS).
This repo is the web server / PWA only — there is NO Capacitor here.

