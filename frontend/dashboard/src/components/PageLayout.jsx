import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const pageTitles = {
  '/overview': 'Safe Driving Fleet Control',
  '/vehicles': 'Vehicles Management',
  '/drivers': 'Drivers Management',
  '/trips': 'Trips Monitoring',
  '/alerts': 'Live Alerts',
  '/analytics': 'Analytics & Insights',
  '/settings': 'Platform Settings',
}

function PageLayout({ user, token, theme, onThemeToggle, onLogout }) {
  const location = useLocation()
  const [socketState, setSocketState] = useState('disconnected')

  const title = useMemo(() => {
    if (location.pathname.startsWith('/vehicles/')) {
      return 'Vehicle Details'
    }
    if (location.pathname.startsWith('/drivers/')) {
      return 'Driver Profile'
    }
    if (location.pathname.startsWith('/trips/')) {
      return 'Trip Details'
    }
    return pageTitles[location.pathname] || 'Safe Driving Fleet Control'
  }, [location.pathname])

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-shell__content">
        <TopBar
          title={title}
          user={user}
          socketState={socketState}
          theme={theme}
          onThemeToggle={onThemeToggle}
          onLogout={onLogout}
        />

        <section className="page-body">
          <Outlet context={{ setSocketState, socketState, user, token, theme, onThemeToggle, onLogout }} />
        </section>
      </div>
    </div>
  )
}

export default PageLayout
