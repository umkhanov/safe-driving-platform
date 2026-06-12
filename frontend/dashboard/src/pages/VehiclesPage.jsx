import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RiskBadge from '../components/RiskBadge'
import StatusBadge from '../components/StatusBadge'
import { ApiError, clearAuth, getTrips, getVehicles } from '../services/api'
import {
  driverNameFromId,
  formatLocationLabel,
  formatTimeAgo,
  normalizeList,
  normalizeRisk,
} from '../utils/fleet'

const statusKind = (status) => {
  const value = String(status || '').toLowerCase()
  if (value === 'active') return 'positive'
  if (value === 'idle') return 'default'
  if (value === 'warning') return 'warning'
  return 'danger'
}

const toStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'Active'
  if (normalized === 'idle') return 'Idle'
  if (normalized === 'warning') return 'Warning'
  return 'Offline'
}

function VehiclesPage({ token, user, onLogout }) {
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadVehicles = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [vehicleData, tripData] = await Promise.all([getVehicles(token), getTrips(token)])
        const realVehicles = normalizeList(vehicleData)
        const trips = normalizeList(tripData)

        const latestTripByVehicle = new Map()
        trips.forEach((trip) => {
          if (!trip.vehicleId) return
          const prev = latestTripByVehicle.get(trip.vehicleId)
          const prevTs = new Date(prev?.startedAt || 0).getTime()
          const nextTs = new Date(trip.startedAt || 0).getTime()
          if (!prev || nextTs > prevTs) {
            latestTripByVehicle.set(trip.vehicleId, trip)
          }
        })

        const normalizedVehicles = realVehicles.map((vehicle) => {
          const latestTrip = latestTripByVehicle.get(vehicle.id)
          const fallbackDriver =
            vehicle.currentDriverId && vehicle.currentDriverId === user?.id
              ? `You (${user.email})`
              : driverNameFromId(vehicle.currentDriverId)

          return {
            ...vehicle,
            statusLabel: toStatusLabel(vehicle.status),
            riskLevelLabel: normalizeRisk(vehicle.riskLevel),
            currentDriverLabel: latestTrip?.driverId
              ? driverNameFromId(latestTrip.driverId)
              : fallbackDriver,
            locationLabel: formatLocationLabel(vehicle.lastLat, vehicle.lastLng),
            locationCompactLabel:
              typeof vehicle.lastLat === 'number' && typeof vehicle.lastLng === 'number'
                ? `${vehicle.lastLat.toFixed(4)}, ${vehicle.lastLng.toFixed(4)}`
                : 'Unavailable',
            lastActivityLabel: formatTimeAgo(
              vehicle.lastSeenAt || latestTrip?.endedAt || latestTrip?.startedAt,
              'No recent activity',
            ),
            lastTripLabel: latestTrip
              ? `TRP-${latestTrip.id} · ${String(latestTrip.status || 'Active')}`
              : 'No trip yet',
            hasLocation: typeof vehicle.lastLat === 'number' && typeof vehicle.lastLng === 'number',
          }
        })

        setVehicles(normalizedVehicles)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch vehicles')
      } finally {
        setIsLoading(false)
      }
    }

    void loadVehicles()
  }, [onLogout, token, user?.email, user?.id])

  const openMap = (vehicle) => {
    if (!vehicle.hasLocation) return
    window.open(
      `https://www.google.com/maps?q=${vehicle.lastLat},${vehicle.lastLng}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const hasVehicles = useMemo(() => vehicles.length > 0, [vehicles.length])

  return (
    <section className="vehicles-page panel">
      <div className="panel__header vehicles-page__header">
        <div>
          <h2>Fleet Vehicles</h2>
          <p className="subtitle">Monitor vehicle health, assigned drivers, and latest risk signals.</p>
        </div>
      </div>

      {isLoading && <p className="loading-text">Loading vehicles...</p>}
      {!isLoading && error && <p className="error-text">{error}</p>}
      {!isLoading && !error && !hasVehicles && (
        <p className="empty-message">No vehicles found in backend yet.</p>
      )}

      {!isLoading && !error && hasVehicles && <div className="vehicles-table-wrap">
        <table className="vehicles-table">
          <thead>
            <tr>
              <th>Vehicle ID</th>
              <th>Vehicle Name</th>
              <th>Status</th>
              <th>Current Driver</th>
              <th>Risk Level</th>
              <th>Last Activity</th>
              <th>Last Known Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>#{vehicle.id}</td>
                <td>{vehicle.name}</td>
                <td>
                  <StatusBadge
                    value={vehicle.statusLabel}
                    kind={statusKind(vehicle.statusLabel)}
                    pulse={vehicle.statusLabel === 'Active'}
                  />
                </td>
                <td>{vehicle.currentDriverLabel}</td>
                <td>
                  <RiskBadge level={vehicle.riskLevelLabel} />
                </td>
                <td>{vehicle.lastActivityLabel}</td>
                <td>
                  <p>{vehicle.locationCompactLabel}</p>
                  <p className="table-subtext">{vehicle.lastTripLabel}</p>
                </td>
                <td>
                  <div className="vehicles-actions">
                    <button
                      type="button"
                      className="button button--ghost vehicles-action-button"
                      onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      className="button button--ghost vehicles-action-button"
                      onClick={() => navigate(`/trips?vehicleId=${vehicle.id}`)}
                    >
                      View Trips
                    </button>
                    <button
                      type="button"
                      className="button button--ghost vehicles-action-button"
                      onClick={() => openMap(vehicle)}
                      disabled={!vehicle.hasLocation}
                    >
                      Open Map
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {!isLoading && !error && hasVehicles && <div className="vehicle-cards">
        {vehicles.map((vehicle) => (
          <article key={vehicle.id} className="vehicle-card summary-card">
            <div className="vehicle-card__row">
              <p className="summary-card__title">Vehicle</p>
              <p className="summary-card__value">#{vehicle.id}</p>
            </div>

            <p className="vehicle-card__name">{vehicle.name}</p>

            <div className="vehicle-card__meta">
              <StatusBadge
                value={vehicle.statusLabel}
                kind={statusKind(vehicle.statusLabel)}
                pulse={vehicle.statusLabel === 'Active'}
              />
              <RiskBadge level={vehicle.riskLevelLabel} />
            </div>

            <p className="vehicle-card__info">Driver: {vehicle.currentDriverLabel}</p>
            <p className="vehicle-card__info">Last Activity: {vehicle.lastActivityLabel}</p>
            <p className="vehicle-card__info">Location: {vehicle.locationCompactLabel}</p>
            <p className="vehicle-card__info">Last Trip: {vehicle.lastTripLabel}</p>

            <div className="vehicles-actions vehicles-actions--stacked">
              <button
                type="button"
                className="button button--ghost vehicles-action-button"
                onClick={() => navigate(`/vehicles/${vehicle.id}`)}
              >
                View Details
              </button>
              <button
                type="button"
                className="button button--ghost vehicles-action-button"
                onClick={() => navigate(`/trips?vehicleId=${vehicle.id}`)}
              >
                View Trips
              </button>
              <button
                type="button"
                className="button button--ghost vehicles-action-button"
                onClick={() => openMap(vehicle)}
                disabled={!vehicle.hasLocation}
              >
                Open Map
              </button>
            </div>
          </article>
        ))}
      </div>}
    </section>
  )
}

export default VehiclesPage
