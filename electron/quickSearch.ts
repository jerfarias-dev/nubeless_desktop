import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import type { CryptoService } from './crypto/cryptoService'
import { copySecret, clearSecretNow } from './clipboard'

/**
 * Búsqueda rápida: atajo global + icono en la bandeja del sistema.
 *
 *  - Ctrl/Cmd+Shift+Espacio abre una ventana pequeña siempre encima para
 *    buscar una cuenta y copiar su contraseña / usuario / código 2FA.
 *  - Si la bóveda está bloqueada, abre la ventana principal para desbloquear.
 *  - La ventana usa el mismo bundle del renderer con la ruta `#quick`
 *    (ver src/main.tsx → QuickSearch).
 */
export const QUICK_SHORTCUT = 'CommandOrControl+Shift+Space'

const isDev = !app.isPackaged

let quickWin: BrowserWindow | null = null
let tray: Tray | null = null
let shortcutEnabled = false

function rendererUrl(hash: string): { url?: string; file?: string; hash: string } {
  if (isDev) return { url: `${process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'}#${hash}`, hash }
  return { file: join(__dirname, '../renderer/index.html'), hash }
}

function mainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => w !== quickWin)
}

function showMain(): void {
  const w = mainWindow()
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

function createQuickWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 380,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  const target = rendererUrl('quick')
  if (target.url) win.loadURL(target.url)
  else win.loadFile(target.file!, { hash: target.hash })
  win.on('blur', () => win.hide())
  win.on('closed', () => { quickWin = null })
  return win
}

export function toggleQuickSearch(crypto: CryptoService): void {
  if (!crypto.isUnlocked()) { showMain(); return }
  if (!quickWin) quickWin = createQuickWindow()
  if (quickWin.isVisible()) { quickWin.hide(); return }

  // Centrar en la pantalla donde está el cursor, un poco arriba del centro
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [w, h] = quickWin.getSize()
  quickWin.setPosition(
    Math.round(workArea.x + (workArea.width - w) / 2),
    Math.round(workArea.y + workArea.height * 0.25),
  )
  quickWin.show()
  quickWin.focus()
  quickWin.webContents.send('quick:open')
}

/** Bloquea desde fuera de la ventana principal (bandeja): avisa al renderer
 *  para que haga su logout normal y limpia lo que quede en memoria/portapapeles. */
function lockFromTray(crypto: CryptoService): void {
  quickWin?.hide()
  clearSecretNow()
  crypto.logout()
  mainWindow()?.webContents.send('auth:lockRequested')
}

function buildTray(crypto: CryptoService): void {
  if (tray) return
  const icon = nativeImage
    .createFromPath(isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
    .resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Nubeless')
  const accel = process.platform === 'darwin' ? 'Cmd+Shift+Espacio' : 'Ctrl+Shift+Espacio'
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Búsqueda rápida (${accel})`, click: () => toggleQuickSearch(crypto) },
    { label: 'Abrir Nubeless', click: showMain },
    { type: 'separator' },
    { label: 'Bloquear', click: () => lockFromTray(crypto) },
    { label: 'Salir', role: 'quit' },
  ]))
  if (process.platform !== 'darwin') tray.on('click', () => toggleQuickSearch(crypto))
}

function setShortcutEnabled(crypto: CryptoService, enabled: boolean): boolean {
  if (enabled === shortcutEnabled) return true
  if (enabled) {
    shortcutEnabled = globalShortcut.register(QUICK_SHORTCUT, () => toggleQuickSearch(crypto))
    return shortcutEnabled
  }
  globalShortcut.unregister(QUICK_SHORTCUT)
  shortcutEnabled = false
  return true
}

export function registerQuickSearch(crypto: CryptoService): void {
  buildTray(crypto)

  // El renderer principal informa la preferencia guardada (localStorage) al iniciar
  // y cada vez que cambia. Devuelve false si otro programa ya usa el atajo.
  ipcMain.handle('quick:setEnabled', (_e, enabled: boolean) => setShortcutEnabled(crypto, !!enabled))
  ipcMain.handle('quick:hide', () => { quickWin?.hide() })
  ipcMain.handle('clipboard:copySecret', (_e, text: string) => { copySecret(String(text ?? '')) })
  ipcMain.handle('clipboard:clearSecret', () => { clearSecretNow() })

  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/** Al bloquear desde la ventana principal, la búsqueda rápida se oculta. */
export function hideQuickSearch(): void {
  quickWin?.hide()
}
