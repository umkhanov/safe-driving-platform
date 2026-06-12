import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Overview', to: '/overview' },
  { label: 'Vehicles', to: '/vehicles' },
  { label: 'Drivers', to: '/drivers' },
  { label: 'Trips', to: '/trips' },
  { label: 'Live Alerts', to: '/alerts' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Settings', to: '/settings' },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <p className="eyebrow">Safe Driving Fleet Control</p>
        <h2>Fleet Control</h2>
      </div>

      <nav className="sidebar__nav" aria-label="Main Navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
