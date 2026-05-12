export interface Account {
  id: number
  platform: string
  username: string
  password: string
  category_id: number
  is_favorite: boolean
  notes: string
  url: string
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
}

export interface Category {
  id: number
  name: string
  description: string
  color: string
  icon: string
  is_default: number
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

export type SyncEventType =
  | { type: 'connected' }
  | { type: 'transferred'; count: number }
  | { type: 'expired' }
  | { type: 'error'; message: string }

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
    start(): Promise<{ qrData: string; expiresAt: number }>
    stop():  Promise<void>
    onEvent(cb: (e: SyncEventType) => void): () => void
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
