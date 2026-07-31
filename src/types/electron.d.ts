export interface Account {
  id: number
  /** UUID v4 — identidad universal usada por el protocolo de sync. */
  uuid: string
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite: boolean
  notes: string
  url: string
  /** Secreto TOTP en base32 (descifrado). Vacío si la cuenta no tiene 2FA. */
  totp_secret: string
  created_at: string
  updated_at: string
}

export interface AccountInput {
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite?: boolean
  notes?: string
  url?: string
  totp_secret?: string
}

export interface Category {
  id: number
  /** UUID v4 — identidad universal usada por el protocolo de sync. */
  uuid: string
  name: string
  description: string
  color: string
  icon: string
  is_default: number
  /** ISO 8601. Usado por LWW en el merge. */
  updated_at?: string
}

export interface CategoryInput {
  name: string
  description?: string
  color: string
  icon?: string
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Muy débil' | 'Débil' | 'Regular' | 'Fuerte' | 'Muy fuerte'
  color: string
  feedback: string[]
}

export interface SyncDirectionStats {
  added: number
  updated: number
  deleted: number
}

/** Desde la perspectiva del desktop (donde corre el merge). */
export interface SyncMergeStats {
  /** Cambios que el desktop adoptó del móvil. */
  pulled: SyncDirectionStats
  /** Cambios que el desktop envió al móvil. */
  pushed: SyncDirectionStats
}

export type SyncEventType =
  | { type: 'connected' }
  | { type: 'merged'; stats: SyncMergeStats }
  | { type: 'expired' }
  | { type: 'error'; message: string }

export interface BackupMeta {
  fileName: string
  fullPath: string
  createdAt: number
  size: number
}

export interface TotpCode {
  code: string
  secondsRemaining: number
  stepSeconds: number
}

export interface ElectronAPI {
  platform: string
  win: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close():    Promise<void>
  }
  auth: {
    isFirstTime():             Promise<boolean>
    createMaster(pwd: string): Promise<void>
    login(pwd: string):        Promise<boolean>
    logout():                  Promise<void>
    verifyPassword(pwd: string): Promise<boolean>
    changeMasterPassword(oldPwd: string, newPwd: string):
      Promise<{ ok: true } | { ok: false; reason: 'wrong-old-password' }>
  }
  accounts: {
    getAll():                        Promise<Account[]>
    create(input: AccountInput):     Promise<Account>
    update(account: Account):        Promise<Account>
    delete(id: number):              Promise<void>
  }
  categories: {
    getAll():                        Promise<Category[]>
    create(input: CategoryInput):    Promise<Category>
    update(cat: Category):           Promise<Category>
    delete(id: number):              Promise<void>
  }
  generator: {
    generate(length: number):        Promise<string>
    evaluate(password: string):      Promise<PasswordStrength>
  }
  vault: {
    exportEncrypted(path: string):              Promise<void>
    importEncrypted(path: string):              Promise<number>
    exportCSV(path: string, safe: boolean):     Promise<number>
    importCSV(path: string):                    Promise<number>
  }
  sync: {
    start(): Promise<{ qrData: string; expiresAt: number; ips: string[] }>
    stop():  Promise<void>
    onEvent(cb: (e: SyncEventType) => void): () => void
  }
  totp: {
    generate(secret: string): Promise<TotpCode>
    validate(secret: string): Promise<boolean>
  }
  backup: {
    create():                          Promise<BackupMeta>
    list():                            Promise<BackupMeta[]>
    restore(fileName: string):         Promise<number>
    delete(fileName: string):          Promise<void>
    openFolder():                      Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<void>
  }
  dialog: {
    saveFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>
    openFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
