# nubeless_desktop — Nubeless Desktop

**Electron 45 + React 18 + TypeScript 5 + better-sqlite3 13.** No es Tauri.
electron-vite como bundler, Zustand para estado, Tailwind, Lucide.

Es la **fuente de verdad** del par de apps Nubeless. La app móvil Flutter
(`../nubeless_mobile`) sincroniza contra el servidor de sync de aquí.

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
  backup/         backups defensivos + respaldo portátil .nubeless (portableBackup.ts)
  import/         importadores de otros gestores (Bitwarden, 1Password, Chrome, Firefox, KeePass)
  generator/      lista de 2048 palabras + generador de frases (idéntica al móvil)
  kit/            kit de emergencia en PDF
  quickSearch.ts  atajo global Ctrl/Cmd+Shift+Espacio + bandeja del sistema
  clipboard.ts    copiar secretos con borrado a 15 s (proceso main)
  sync/applyMerge.ts  merge compartido por el sync QR y la importación .nubeless
src/
  pages/          LoginPage, MainPage (vistas Cuentas/Seguridad/Papelera), QuickSearch (#quick)
  components/      diálogos + tabla de cuentas + SyncDialog
  store/           Zustand (useStore, useSettings)
  hooks/useIdleLock.ts   auto-lock por inactividad
```

## Comandos
- `npm run dev` — Electron + hot reload
- `npm test` / `npm run test:watch` — vitest, 88 tests (crypto, merge, totp, passwordHealth, frases, importadores, respaldo)
- `npm run build` — electron-vite build + electron-builder (solo empaqueta para el SO actual)
- `npm run build:unpack` — build sin `.dmg`/`.exe`

## Notas de entorno
- Node 22+ (lo exige better-sqlite3 13). better-sqlite3 13 trae binarios N-API
  precompilados (`prebuilds/`), no compila nada ni depende de la versión de Electron.
- Electron 45 descarga su binario la primera vez que se usa (no en `npm install`).

## Reglas
- La contraseña maestra **nunca** se escribe a disco: solo `salt` y `verify` cifrado en `userData`.
- `schema_version` en la tabla `meta` (actual: 4). Toda migración nueva en `runMigrations()`, idempotente.
- El sync aplica **categorías antes que cuentas** (FK). Identidad universal = `uuid` / `category_uuid`, nunca el id autoincrement.
- Cualquier cambio en formato wire / crypto / QR → actualizar también `../nubeless_mobile`. Ver `../AGENTS.md §8`.

## Publicación
`electron-builder.yml` → `appId: mx.jerfarias.nubeless.desktop`, `productName: Nubeless`. Distribución fuera de tiendas: web
(`../nubeless-web/`) + GitHub Releases. Falta firma Developer ID + notarización
(macOS) y firma de código (Windows). Licencia MIT. Checklist: `../AGENTS.md §9`.
