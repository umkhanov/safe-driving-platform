import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'
import { getDevices } from '../services/api'

const MONITORING_MODE_KEY = 'safeDrivingMonitoringMode'
const CRASH_DETECTION_KEY = 'safeDrivingCrashDetection'

const readToggle = (keys, fallback = true) => {
  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (raw !== null) return raw === 'true'
  }
  return fallback
}

const socketToPresentation = (socketState) => {
  if (socketState === 'connected') {
    return { label: 'Connected', kind: 'positive', pulse: true }
  }

  if (socketState === 'connecting') {
    return { label: 'Connecting', kind: 'warning', pulse: false }
  }

  return { label: 'Disconnected', kind: 'danger', pulse: false }
}

function SettingsPage() {
  const { theme, token, socketState } = useOutletContext()

  const [monitoringMode] = useState(() => readToggle([MONITORING_MODE_KEY], true))
  const [crashDetection] = useState(() => readToggle([CRASH_DETECTION_KEY], true))
  const [backendApiStatus, setBackendApiStatus] = useState('checking')

  useEffect(() => {
    let isMounted = true

    const checkBackendStatus = async () => {
      try {
        await getDevices(token)
        if (isMounted) setBackendApiStatus('online')
      } catch {
        if (isMounted) setBackendApiStatus('offline')
      }
    }

    Promise.resolve().then(checkBackendStatus)

    return () => {
      isMounted = false
    }
  }, [token])

  const realtime = useMemo(() => socketToPresentation(socketState), [socketState])

  const backendApi = useMemo(() => {
    if (backendApiStatus === 'online') {
      return { label: 'Online', kind: 'positive' }
    }

    if (backendApiStatus === 'checking') {
      return { label: 'Checking', kind: 'warning' }
    }

    return { label: 'Offline', kind: 'danger' }
  }, [backendApiStatus])

  return (
    <section className="settings-page settings-page--compact panel">
      <div className="panel__header settings-page__header">
        <div>
          <h2>Platform Settings</h2>
        </div>
      </div>

      <div className="settings-compact-grid">
        <article className="settings-compact-card">
          <h3 className="settings-compact-card__title">Appearance</h3>
          <div className="settings-row">
            <p className="settings-row__label">Current Theme</p>
            <p className="settings-row__value">{theme === 'dark' ? 'Dark' : 'Light'}</p>
          </div>
        </article>

        <article className="settings-compact-card">
          <h3 className="settings-compact-card__title">Monitoring</h3>
          <div className="settings-row">
            <p className="settings-row__label">Monitoring Mode</p>
            <StatusBadge
              value={monitoringMode ? 'Enabled' : 'Disabled'}
              kind={monitoringMode ? 'positive' : 'default'}
            />
          </div>
          <div className="settings-row">
            <p className="settings-row__label">Crash Detection</p>
            <StatusBadge
              value={crashDetection ? 'Enabled' : 'Disabled'}
              kind={crashDetection ? 'critical' : 'default'}
            />
          </div>
        </article>

        <article className="settings-compact-card">
          <h3 className="settings-compact-card__title">System</h3>
          <div className="settings-row">
            <p className="settings-row__label">Realtime Status</p>
            <StatusBadge value={realtime.label} kind={realtime.kind} pulse={realtime.pulse} />
          </div>
          <div className="settings-row">
            <p className="settings-row__label">Backend API</p>
            <StatusBadge value={backendApi.label} kind={backendApi.kind} />
          </div>
        </article>

        <article className="settings-compact-card">
          <h3 className="settings-compact-card__title">Version</h3>
          <div className="settings-row">
            <p className="settings-row__label">Build</p>
            <p className="settings-row__value">Safe Driving Fleet Control v1.0</p>
          </div>
        </article>
      </div>
    </section>
  )
}

export default SettingsPage
