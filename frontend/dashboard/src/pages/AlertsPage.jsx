import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'
import { ApiError, clearAuth, getAlarms } from '../services/api'
import { formatDateTime, normalizeList, formatAlarmKind } from '../utils/fleet'

const severityKind = (severity) => {
  const value = String(severity || '').toLowerCase()
  if (value === 'critical') return 'critical'
  if (value === 'high') return 'danger'
  if (value === 'medium') return 'warning'
  if (value === 'low') return 'positive'
  return 'default'
}

const severityLabel = (severity) => {
  const value = String(severity || '').toLowerCase()
  if (value === 'critical') return 'Critical'
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'
  if (value === 'low') return 'Low'
  return 'Unknown'
}

const buildFilterState = (searchParams) => ({
  driverId: searchParams.get('driverId') || '',
  vehicleId: searchParams.get('vehicleId') || '',
  tripId: searchParams.get('tripId') || '',
  severity: searchParams.get('severity') || '',
  type: searchParams.get('type') || '',
  status: searchParams.get('status') || '',
})

function AlertsPage({ token, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [formFilters, setFormFilters] = useState(() => buildFilterState(searchParams))
  const [alarms, setAlarms] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const activeFilters = useMemo(() => buildFilterState(searchParams), [searchParams])

  useEffect(() => {
    const loadAlarms = async () => {
      setIsLoading(true)
      setError('')

      try {
        const alarmData = await getAlarms(token, activeFilters)
        const rows = normalizeList(alarmData).sort((a, b) => {
          const aTs = new Date(a.ts || a.createdAt || 0).getTime()
          const bTs = new Date(b.ts || b.createdAt || 0).getTime()
          return bTs - aTs
        })
        setAlarms(rows)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch alarms')
      } finally {
        setIsLoading(false)
      }
    }

    void loadAlarms()
  }, [activeFilters, onLogout, token])

  const hasAlarms = alarms.length > 0

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    setFormFilters((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const applyFilters = (event) => {
    event.preventDefault()
    const next = new URLSearchParams()

    Object.entries(formFilters).forEach(([key, value]) => {
      if (!value) return
      next.set(key, value)
    })

    setSearchParams(next)
  }

  const clearFilters = () => {
    setFormFilters({
      driverId: '',
      vehicleId: '',
      tripId: '',
      severity: '',
      type: '',
      status: '',
    })
    setSearchParams({})
  }

  return (
    <section className="alerts-page panel">
      <div className="panel__header alerts-page__header">
        <div>
          <h2>Live Alerts</h2>
          <p className="subtitle">
            Inspect active and historical safety alerts with backend-level filtering.
          </p>
        </div>
      </div>

      <form className="alerts-filters" onSubmit={applyFilters}>
        <label>
          Driver ID
          <input
            type="text"
            name="driverId"
            value={formFilters.driverId}
            onChange={handleFilterChange}
            placeholder="e.g. 1"
          />
        </label>
        <label>
          Vehicle ID
          <input
            type="text"
            name="vehicleId"
            value={formFilters.vehicleId}
            onChange={handleFilterChange}
            placeholder="e.g. 1"
          />
        </label>
        <label>
          Trip ID
          <input
            type="text"
            name="tripId"
            value={formFilters.tripId}
            onChange={handleFilterChange}
            placeholder="e.g. 3"
          />
        </label>
        <label>
          Severity
          <select name="severity" value={formFilters.severity} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label>
          Type
          <select name="type" value={formFilters.type} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="HARD_BRAKE">Hard Braking</option>
            <option value="RAPID_ACCEL">Rapid Acceleration</option>
            <option value="SHARP_TURN">Sharp Turn</option>
            <option value="CRASH_DETECTED">Potential Crash</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" value={formFilters.status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="active">Active only</option>
          </select>
        </label>
        <div className="alerts-filters__actions">
          <button type="submit" className="button">
            Apply
          </button>
          <button type="button" className="button button--ghost" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </form>

      {isLoading && <p className="loading-text">Loading alerts...</p>}
      {!isLoading && error && <p className="error-text">{error}</p>}
      {!isLoading && !error && !hasAlarms && (
        <p className="empty-message">No alarms found for the current filters.</p>
      )}

      {!isLoading && !error && hasAlarms && (
        <>
          <div className="alerts-table-wrap">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Trip</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {alarms.map((alarm) => (
                  <tr
                    key={alarm.id}
                    className={(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alarm-row--critical' : ''}
                  >
                    <td>#{alarm.id}</td>
                    <td>
                      <span className={(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alarm-type--critical' : ''}>
                        {formatAlarmKind(alarm.kind || alarm.type)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={severityLabel(alarm.severity)} kind={severityKind(alarm.severity)} />
                    </td>
                    <td>{alarm.driverId ? `#${alarm.driverId}` : '-'}</td>
                    <td>{alarm.vehicleId ? `#${alarm.vehicleId}` : '-'}</td>
                    <td>{alarm.tripId ? `TRP-${alarm.tripId}` : '-'}</td>
                    <td>{alarm.deviceId ?? '-'}</td>
                    <td>{alarm.acknowledgedAt ? 'Acknowledged' : 'Active'}</td>
                    <td>{formatDateTime(alarm.ts || alarm.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="alerts-cards">
            {alarms.map((alarm) => (
              <article
                key={alarm.id}
                className={`summary-card alerts-card ${(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alerts-card--critical' : ''}`.trim()}
              >
                <div className="alerts-card__row">
                  <p className="summary-card__title">Alarm</p>
                  <p className="summary-card__value">#{alarm.id}</p>
                </div>
                <p className={`alerts-card__type ${(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alarm-type--critical' : ''}`.trim()}>
                  {formatAlarmKind(alarm.kind || alarm.type)}
                </p>
                <div className="alerts-card__badges">
                  <StatusBadge value={severityLabel(alarm.severity)} kind={severityKind(alarm.severity)} />
                  <StatusBadge
                    value={alarm.acknowledgedAt ? 'Acknowledged' : 'Active'}
                    kind={alarm.acknowledgedAt ? 'default' : 'warning'}
                  />
                </div>
                <p className="alerts-card__info">Driver: {alarm.driverId ? `#${alarm.driverId}` : '-'}</p>
                <p className="alerts-card__info">Vehicle: {alarm.vehicleId ? `#${alarm.vehicleId}` : '-'}</p>
                <p className="alerts-card__info">Trip: {alarm.tripId ? `TRP-${alarm.tripId}` : '-'}</p>
                <p className="alerts-card__info">Time: {formatDateTime(alarm.ts || alarm.createdAt)}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default AlertsPage
