import StatusBadge from './StatusBadge'
import { Moon, Sun } from 'lucide-react'

function TopBar({ title, user, socketState, theme, onThemeToggle, onLogout }) {
  const socketLabel =
    socketState === 'connected'
      ? 'REALTIME CONNECTED'
      : socketState === 'connecting'
        ? 'REALTIME CONNECTING'
        : 'REALTIME DISCONNECTED'

  const socketKind =
    socketState === 'connected'
      ? 'positive'
      : socketState === 'connecting'
        ? 'warning'
        : 'danger'

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Safe Driving Fleet Control</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar__actions">
        <StatusBadge
          value={socketLabel}
          kind={socketKind}
          pulse={socketState === 'connected'}
          className="realtime-badge"
        />

        <div className="user-card">
          <p className="user-card__email">{user?.email}</p>
          <p className="user-card__role">Role: {user?.role}</p>
        </div>

        <button
          type="button"
          className="button button--ghost theme-toggle-button"
          onClick={onThemeToggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
        </button>

        <button type="button" className="button button--ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

export default TopBar
