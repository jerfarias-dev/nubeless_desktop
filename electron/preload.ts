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
    logout:         ()           => invoke<void>('auth:logout'),
    verifyPassword: (pwd: string) => invoke<boolean>('auth:verifyPassword', pwd)
  },

  // Accounts
  accounts: {
    getAll:  ()           => invoke<unknown[]>('accounts:getAll'),
    create:  (input: unknown) => invoke<unknown>('accounts:create', input),
    update:  (account: unknown) => invoke<unknown>('accounts:update', account),
    delete:  (id: number) => invoke<void>('accounts:delete', id)
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
    evaluate: (password: string) => invoke<unknown>('generator:evaluate', password)
  },

  // Vault
  vault: {
    exportEncrypted: (path: string)               => invoke<void>('vault:exportEncrypted', path),
    importEncrypted: (path: string)               => invoke<number>('vault:importEncrypted', path),
    exportCSV:       (path: string, safe: boolean) => invoke<number>('vault:exportCSV', path, safe),
    importCSV:       (path: string)               => invoke<number>('vault:importCSV', path)
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
    start: () => invoke<{ qrData: string; expiresAt: number }>('sync:start'),
    stop:  () => invoke<void>('sync:stop'),
    onEvent: (cb: (event: unknown) => void) => {
      ipcRenderer.on('sync:event', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('sync:event')
    }
  },

  platform: process.platform
})
