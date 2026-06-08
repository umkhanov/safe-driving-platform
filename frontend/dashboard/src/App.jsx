import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import PageLayout from './components/PageLayout'
import AlertsPage from './pages/AlertsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import DriverDetailsPage from './pages/DriverDetailsPage'
import DriversPage from './pages/DriversPage'
import LoginPage from './pages/LoginPage'
import OverviewPage from './pages/OverviewPage'
import SettingsPage from './pages/SettingsPage'
import TripDetailsPage from './pages/TripDetailsPage'
import TripsPage from './pages/TripsPage'
import VehicleDetailsPage from './pages/VehicleDetailsPage'
import VehiclesPage from './pages/VehiclesPage'
import { clearAuth, getStoredAuth } from './services/api'

const THEME_KEY = 'safeDrivingTheme'

const getStoredTheme = () => {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : 'dark'
}

function App() {
  const [auth, setAuth] = useState(() => getStoredAuth())
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const handleLogin = (nextAuth) => {
    setAuth(nextAuth)
  }

  const handleThemeToggle = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'))
  }

  const handleLogout = () => {
    clearAuth()
    setAuth({ token: null, user: null })
  }

  if (!auth.token) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PageLayout
              user={auth.user}
              token={auth.token}
              theme={theme}
              onThemeToggle={handleThemeToggle}
              onLogout={handleLogout}
            />
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage token={auth.token} onLogout={handleLogout} />} />
          <Route path="vehicles" element={<VehiclesPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="vehicles/:vehicleId" element={<VehicleDetailsPage token={auth.token} onLogout={handleLogout} />} />
          <Route path="drivers" element={<DriversPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="drivers/:driverId" element={<DriverDetailsPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="trips" element={<TripsPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="trips/:tripId" element={<TripDetailsPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="alerts" element={<AlertsPage token={auth.token} onLogout={handleLogout} />} />
          <Route path="analytics" element={<AnalyticsPage token={auth.token} user={auth.user} onLogout={handleLogout} />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
