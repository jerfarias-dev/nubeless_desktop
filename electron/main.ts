import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'node:path'
import { CryptoService } from './crypto/cryptoService'
import { initDatabase, closeDb } from './db/database'
import { BackupService } from './backup/backupService'
import { registerAuthHandlers } from './ipc/auth'
import { registerAccountHandlers } from './ipc/accounts'
import { registerCategoryHandlers } from './ipc/categories'
import { registerGeneratorHandlers } from './ipc/generator'
import { registerVaultHandlers } from './ipc/vault'
import { registerSyncHandlers } from './ipc/sync'
import { registerBackupHandlers } from './ipc/backup'
import { registerTotpHandlers } from './ipc/totp'
import { ipcMain } from 'electron'

const isDev = !app.isPackaged

function createWindow(userDataPath: string): BrowserWindow {
  // En dev el icono del dock/taskbar viene de aquí; en build lo aplica
  // electron-builder desde resources/icon.* Resolvemos siempre el PNG (es el
  // único formato que BrowserWindow acepta cross-platform en runtime).
  const iconPath = isDev
    ? join(__dirname, '../../resources/icon.png')   // dev: relativo al out/main
    : join(process.resourcesPath, 'icon.png')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HomeVault',
    backgroundColor: '#1a1a2e',
    icon: iconPath,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external URLs in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')

  // macOS dev: el icono del dock no toma el del BrowserWindow, hay que setearlo
  // explícitamente. En el build empaquetado, electron-builder ya lo asigna correctamente.
  if (isDev && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }

  const crypto = new CryptoService(userDataPath)
  initDatabase(userDataPath)
  const backup = new BackupService(crypto, userDataPath)

  // Register IPC handlers
  registerAuthHandlers(crypto, backup)
  registerAccountHandlers(crypto)
  registerCategoryHandlers()
  registerGeneratorHandlers()
  registerVaultHandlers(crypto, userDataPath)
  registerSyncHandlers(crypto)
  registerBackupHandlers(backup)
  registerTotpHandlers()

  // Shell open external
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  // Window controls (usados por la barra de título personalizada en Windows)
  ipcMain.handle('win:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  ipcMain.handle('win:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.handle('win:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close() })

  // File dialog for vault export/import
  ipcMain.handle('dialog:saveFile', async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog({ filters })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openFile', async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({ filters, properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })

  createWindow(userDataPath)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(userDataPath)
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})
