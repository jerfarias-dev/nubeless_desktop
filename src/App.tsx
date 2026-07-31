import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { useSettings } from './store/useSettings'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'

export default function App() {
  const { isAuthenticated, checkFirstTime } = useStore()
  const theme = useSettings(s => s.theme)

  useEffect(() => {
    checkFirstTime()
  }, [checkFirstTime])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return isAuthenticated ? <MainPage /> : <LoginPage />
}
