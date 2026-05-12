import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'node:path'
import { CryptoService } from './crypto/cryptoService'
import { initDatabase, closeDb } from './db/database'
import { registerAuthHandlers } from './ipc/auth'
import { registerAccountHandlers } from './ipc/accounts'
import { registerCategoryHandlers } from './ipc/categories'
import { registerGeneratorHandlers } from './ipc/generator'
import { registerVaultHandlers } from './ipc/vault'
import { registerSyncHandlers } from './ipc/sync'
import { ipcMain } from 'electron'

const isDev = !app.isPackaged

function createWindow(userDataPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a1a2e',
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

  const crypto = new CryptoService(userDataPath)
  initDatabase(userDataPath)

  // Register IPC handlers
  registerAuthHandlers(crypto)
  registerAccountHandlers(crypto)
  registerCategoryHandlers()
  registerGeneratorHandlers()
  registerVaultHandlers(crypto, userDataPath)
  registerSyncHandlers(crypto)

  // Shell open external
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

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
