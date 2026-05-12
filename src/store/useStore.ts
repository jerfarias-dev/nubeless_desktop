import { create } from 'zustand'
import type { Account, Category, AccountInput, CategoryInput } from '../types/electron'

interface StatusMessage {
  text: string
  type: 'info' | 'success' | 'error'
}

interface Filters {
  search: string
  categoryId: number | null
  favoritesOnly: boolean
}

interface AppState {
  // Auth
  isAuthenticated: boolean
  isFirstTime: boolean

  // Data
  accounts: Account[]
  categories: Category[]

  // UI
  filters: Filters
  statusMessage: StatusMessage | null
  clipboardTimer: ReturnType<typeof setTimeout> | null

  // Actions: auth
  checkFirstTime(): Promise<void>
  login(pwd: string): Promise<boolean>
  createMaster(pwd: string): Promise<void>
  logout(): Promise<void>

  // Actions: accounts
  loadAccounts(): Promise<void>
  createAccount(input: AccountInput): Promise<Account>
  updateAccount(account: Account): Promise<Account>
  deleteAccount(id: number): Promise<void>

  // Actions: categories
  loadCategories(): Promise<void>
  createCategory(input: CategoryInput): Promise<Category>
  updateCategory(cat: Category): Promise<Category>
  deleteCategory(id: number): Promise<void>

  // Actions: clipboard
  copyToClipboard(text: string, label: string): void

  // Actions: filters
  setFilter<K extends keyof Filters>(key: K, value: Filters[K]): void

  // Actions: status
  setStatus(msg: StatusMessage | null): void

  // Derived
  filteredAccounts(): Account[]
}

export const useStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  isFirstTime: false,
  accounts: [],
  categories: [],
  filters: { search: '', categoryId: null, favoritesOnly: false },
  statusMessage: null,
  clipboardTimer: null,

  // --- Auth ---

  async checkFirstTime() {
    const isFirstTime = await window.electronAPI.auth.isFirstTime()
    set({ isFirstTime })
  },

  async login(pwd) {
    const ok = await window.electronAPI.auth.login(pwd)
    if (ok) {
      await Promise.all([get().loadAccounts(), get().loadCategories()])
      set({ isAuthenticated: true })
    }
    return ok
  },

  async createMaster(pwd) {
    await window.electronAPI.auth.createMaster(pwd)
    await Promise.all([get().loadAccounts(), get().loadCategories()])
    set({ isAuthenticated: true, isFirstTime: false })
  },

  async logout() {
    await window.electronAPI.auth.logout()
    set({ isAuthenticated: false, accounts: [], categories: [], filters: { search: '', categoryId: null, favoritesOnly: false } })
  },

  // --- Accounts ---

  async loadAccounts() {
    const accounts = await window.electronAPI.accounts.getAll()
    set({ accounts })
  },

  async createAccount(input) {
    const account = await window.electronAPI.accounts.create(input)
    set(s => ({
      accounts: [...s.accounts, account].sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return b.is_favorite ? 1 : -1
        return a.platform.localeCompare(b.platform)
      })
    }))
    return account
  },

  async updateAccount(account) {
    const updated = await window.electronAPI.accounts.update(account)
    set(s => ({
      accounts: s.accounts
        .map(a => a.id === updated.id ? updated : a)
        .sort((a, b) => {
          if (a.is_favorite !== b.is_favorite) return b.is_favorite ? 1 : -1
          return a.platform.localeCompare(b.platform)
        })
    }))
    return updated
  },

  async deleteAccount(id) {
    await window.electronAPI.accounts.delete(id)
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },

  // --- Categories ---

  async loadCategories() {
    const categories = await window.electronAPI.categories.getAll()
    set({ categories })
  },

  async createCategory(input) {
    const cat = await window.electronAPI.categories.create(input)
    set(s => ({ categories: [...s.categories, cat] }))
    return cat
  },

  async updateCategory(cat) {
    const updated = await window.electronAPI.categories.update(cat)
    set(s => ({ categories: s.categories.map(c => c.id === updated.id ? updated : c) }))
    return updated
  },

  async deleteCategory(id) {
    await window.electronAPI.categories.delete(id)
    set(s => ({ categories: s.categories.filter(c => c.id !== id) }))
  },

  // --- Clipboard ---

  copyToClipboard(text, label) {
    navigator.clipboard.writeText(text)
    const { clipboardTimer } = get()
    if (clipboardTimer) clearTimeout(clipboardTimer)

    const timer = setTimeout(async () => {
      await navigator.clipboard.writeText('')
      set({ statusMessage: null, clipboardTimer: null })
    }, 15_000)

    set({
      clipboardTimer: timer,
      statusMessage: { text: `${label} copiado — se limpiará en 15 s`, type: 'success' }
    })
  },

  // --- Filters ---

  setFilter(key, value) {
    set(s => ({ filters: { ...s.filters, [key]: value } }))
  },

  // --- Status ---

  setStatus(msg) {
    set({ statusMessage: msg })
  },

  // --- Derived ---

  filteredAccounts() {
    const { accounts, filters } = get()
    const search = filters.search.toLowerCase()
    return accounts.filter(a => {
      if (filters.favoritesOnly && !a.is_favorite) return false
      if (filters.categoryId !== null && a.category_id !== filters.categoryId) return false
      if (search && !a.platform.toLowerCase().includes(search) && !a.username.toLowerCase().includes(search)) return false
      return true
    })
  }
}))
