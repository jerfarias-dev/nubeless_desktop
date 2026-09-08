# password_manager_2 — Nubeless Desktop

**Electron 29 + React 18 + TypeScript 5 + better-sqlite3.** No es Tauri.
electron-vite como bundler, Zustand para estado, Tailwind, Lucide.

Es la **fuente de verdad** del par de apps Nubeless. La app móvil Flutter
(`../password-manager-mobile`) sincroniza contra el servidor de sync de aquí.

## Docs
- `README.md` — completo: features, build, distribución, seguridad, CSV.
- `../AGENTS.md` — **contrato de sync compartido** con la app móvil. Léelo antes
  de tocar `electron/sync/`, `electron/crypto/` o el esquema de la DB.

## Mapa
```
electron/
  main.ts         proceso principal, crea ventana, registra IPC handlers
  preload.ts      contextBridge renderer ↔ main
  crypto/         AES-256-GCM + PBKDF2-SHA512 600k; vault, session key, cambio de master pw
  db/             SQLite (better-sqlite3): database.ts (schema + migraciones), accountRepo, categoryRepo
  ipc/            handlers por dominio: auth, accounts, categories, generator, vault, sync, backup, totp
  sync/           syncServer.ts (HTTP local efímero) + mergeService.ts (LWW por uuid + tombstones)
  totp/           RFC 6238
  backup/         backups defensivos antes de operaciones destructivas
src/
  pages/          LoginPage, MainPage
  components/      diálogos + tabla de cuentas + SyncDialog
  store/           Zustand (useStore, useSettings)
  hooks/useIdleLock.ts   auto-lock por inactividad
```

## Comandos
- `npm run dev` — Electron + hot reload
- `npm test` / `npm run test:watch` — vitest (crypto, merge, totp, passwordHealth)
- `npm run build` — electron-vite build + electron-builder (solo empaqueta para el SO actual)
- `npm run build:unpack` — build sin `.dmg`/`.exe`

## Reglas
- La contraseña maestra **nunca** se escribe a disco: solo `salt` y `verify` cifrado en `userData`.
- `schema_version` en la tabla `meta` (actual: 4). Toda migración nueva en `runMigrations()`, idempotente.
- El sync aplica **categorías antes que cuentas** (FK). Identidad universal = `uuid` / `category_uuid`, nunca el id autoincrement.
- Cualquier cambio en formato wire / crypto / QR → actualizar también `../password-manager-mobile`. Ver `../AGENTS.md §8`.

## Publicación
`electron-builder.yml` → `appId: mx.jerfarias.nubeless.desktop`, `productName: Nubeless`. Distribución fuera de tiendas: web
(`../nubeless-web/`) + GitHub Releases. Falta firma Developer ID + notarización
(macOS) y firma de código (Windows). Licencia MIT. Checklist: `../AGENTS.md §9`.
