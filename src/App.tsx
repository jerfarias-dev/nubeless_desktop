import { useEffect } from 'react'
import { useStore } from './store/useStore'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'

export default function App() {
  const { isAuthenticated, checkFirstTime } = useStore()

  useEffect(() => {
    checkFirstTime()
  }, [checkFirstTime])

  return isAuthenticated ? <MainPage /> : <LoginPage />
}
