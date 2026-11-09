import { contextBridge, ipcRenderer } from 'electron'

// Type-safe IPC invoke wrapper
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  auth: {
    isFirstTime:    ()           => invoke<boolean>('auth:isFirstTime'),
    createMaster:   (pwd: string) => invoke<void>('auth:createMaster', pwd),
    login:          (pwd: string) => invoke<boolean>('auth:login', pwd),
    logout:         ()           => { ipcRenderer.send('auth:locked'); return invoke<void>('auth:logout') },
    onLockRequested: (cb: () => void) => {
      ipcRenderer.on('auth:lockRequested', () => cb())
      return () => ipcRenderer.removeAllListeners('auth:lockRequested')
    },
    verifyPassword: (pwd: string) => invoke<boolean>('auth:verifyPassword', pwd),
    changeMasterPassword: (oldPwd: string, newPwd: string) =>
      invoke<{ ok: true } | { ok: false; reason: 'wrong-old-password' }>(
        'auth:changeMasterPassword', oldPwd, newPwd
      )
  },

  // Accounts
  accounts: {
    getAll:  ()           => invoke<unknown[]>('accounts:getAll'),
    create:  (input: unknown) => invoke<unknown>('accounts:create', input),
    update:  (account: unknown) => invoke<unknown>('accounts:update', account),
    delete:  (id: number) => invoke<void>('accounts:delete', id),
    getTrash: ()          => invoke<unknown[]>('accounts:getTrash'),
    restore: (id: number) => invoke<unknown>('accounts:restore', id)
  },

  // Categories
  categories: {
    getAll:  ()             => invoke<unknown[]>('categories:getAll'),
    create:  (input: unknown) => invoke<unknown>('categories:create', input),
    update:  (cat: unknown)   => invoke<unknown>('categories:update', cat),
    delete:  (id: number)   => invoke<void>('categories:delete', id)
  },

  // Generator
  generator: {
    generate: (length: number)   => invoke<string>('generator:generate', length),
    passphrase: (opts: unknown)  => invoke<string>('generator:passphrase', opts),
    evaluate: (password: string) => invoke<unknown>('generator:evaluate', password)
  },

  // Vault
  vault: {
    exportEncrypted: (path: string)               => invoke<void>('vault:exportEncrypted', path),
    importEncrypted: (path: string)               => invoke<number>('vault:importEncrypted', path),
    exportCSV:       (path: string, safe: boolean) => invoke<number>('vault:exportCSV', path, safe),
    importCSV:       (path: string)               => invoke<number>('vault:importCSV', path),
    importPreview:   (path: string)               => invoke<unknown>('vault:importPreview', path),
    importRun:       (path: string, opts: unknown) => invoke<unknown>('vault:importRun', path, opts)
  },

  // Shell & dialogs
  shell: {
    openExternal: (url: string) => invoke<void>('shell:openExternal', url)
  },

  dialog: {
    saveFile: (filters: { name: string; extensions: string[] }[]) =>
      invoke<string | null>('dialog:saveFile', filters),
    openFile: (filters: { name: string; extensions: string[] }[]) =>
      invoke<string | null>('dialog:openFile', filters)
  },

  // Sync
  sync: {
    start: () => invoke<{ qrData: string; expiresAt: number; ips: string[] }>('sync:start'),
    stop:  () => invoke<void>('sync:stop'),
    onEvent: (cb: (event: unknown) => void) => {
      ipcRenderer.on('sync:event', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('sync:event')
    }
  },

  // TOTP / 2FA
  totp: {
    generate: (secret: string) =>
      invoke<{ code: string; secondsRemaining: number; stepSeconds: number }>('totp:generate', secret),
    validate: (secret: string) => invoke<boolean>('totp:validate', secret)
  },

  // Backups
  backup: {
    create:     ()                   => invoke<unknown>('backup:create'),
    list:       ()                   => invoke<unknown[]>('backup:list'),
    restore:    (fileName: string)   => invoke<number>('backup:restore', fileName),
    delete:     (fileName: string)   => invoke<void>('backup:delete', fileName),
    openFolder: ()                   => invoke<void>('backup:openFolder'),
    exportPortable: (path: string, pwd: string) => invoke<number>('backup:exportPortable', path, pwd),
    importPortable: (path: string, pwd: string) => invoke<unknown>('backup:importPortable', path, pwd)
  },

  // Búsqueda rápida (ventana #quick + atajo global)
  quick: {
    setEnabled: (enabled: boolean) => invoke<boolean>('quick:setEnabled', enabled),
    hide:       ()                 => invoke<void>('quick:hide'),
    onOpen: (cb: () => void) => {
      ipcRenderer.on('quick:open', () => cb())
      return () => ipcRenderer.removeAllListeners('quick:open')
    }
  },

  // Portapapeles con auto-borrado (proceso main)
  clipboard: {
    copySecret:  (text: string) => invoke<void>('clipboard:copySecret', text),
    clearSecret: ()             => invoke<void>('clipboard:clearSecret')
  },

  // Kit de emergencia (PDF)
  kit: {
    exportPdf: (path: string) => invoke<void>('kit:exportPdf', path)
  },

  // Window controls (solo Windows)
  win: {
    minimize: () => invoke<void>('win:minimize'),
    maximize: () => invoke<void>('win:maximize'),
    close:    () => invoke<void>('win:close')
  },

  platform: process.platform
})
