import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import QuickSearch from './pages/QuickSearch'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.hash === '#quick' ? <QuickSearch /> : <App />}
  </React.StrictMode>
)
