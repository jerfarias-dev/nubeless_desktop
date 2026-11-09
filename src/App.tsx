import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { useSettings } from './store/useSettings'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'

export default function App() {
  const { isAuthenticated, checkFirstTime, logout } = useStore()
  const theme = useSettings(s => s.theme)
  const quickSearchEnabled = useSettings(s => s.quickSearchEnabled)

  useEffect(() => {
    checkFirstTime()
  }, [checkFirstTime])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // La preferencia vive en localStorage; el atajo global lo registra el main.
  useEffect(() => {
    void window.electronAPI.quick.setEnabled(quickSearchEnabled)
  }, [quickSearchEnabled])

  // "Bloquear" desde la bandeja del sistema
  useEffect(() => window.electronAPI.auth.onLockRequested(() => { void logout() }), [logout])

  return isAuthenticated ? <MainPage /> : <LoginPage />
}
