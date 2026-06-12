import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RiskBadge from '../components/RiskBadge'
import TripStatusBadge from '../components/TripStatusBadge'
import { ApiError, clearAuth, getAlarms, getTrips, getVehicles } from '../services/api'
import {
  driverNameFromId,
  formatDateTime,
  formatDuration,
  normalizeList,
  normalizeRisk,
  vehicleNameFromId,
} from '../utils/fleet'

const toStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'Active'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'warning') return 'Warning'
  return 'Interrupted'
}

function TripsPage({ token, user, onLogout }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [trips, setTrips] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const filterDriverId = searchParams.get('driverId')
  const filterVehicleId = searchParams.get('vehicleId')

  useEffect(() => {
    const loadTrips = async () => {
      setIsLoading(true)
      setError('')

      try {
        const filters = {
          driverId: filterDriverId || undefined,
          vehicleId: filterVehicleId || undefined,
        }

        const [tripData, vehicleData, alarmData] = await Promise.all([
          getTrips(token, filters),
          getVehicles(token),
          getAlarms(token),
        ])

        const realTrips = normalizeList(tripData)
        const vehicles = normalizeList(vehicleData)
        const alarms = normalizeList(alarmData)

        const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
        const alarmsByTrip = new Map()
        alarms.forEach((alarm) => {
          if (!alarm.tripId) return
          const count = alarmsByTrip.get(alarm.tripId) || 0
          alarmsByTrip.set(alarm.tripId, count + 1)
        })

        const normalizedTrips = realTrips.map((trip) => {
          const vehicle = vehicleById.get(trip.vehicleId)
          const derivedAlerts = alarmsByTrip.get(trip.id)
          const driverName =
            trip.driverId === user?.id ? `You (${user.email})` : driverNameFromId(trip.driverId)

          return {
            ...trip,
            idLabel: `TRP-${trip.id}`,
            driverName,
            vehicleName: vehicle?.name || vehicleNameFromId(trip.vehicleId),
            startTime: trip.startedAt,
            endTime: trip.endedAt,
            duration: formatDuration(trip.startedAt, trip.endedAt),
            distanceKm: Number(trip.distance || 0),
            distanceLabel:
              Number(trip.distance || 0) > 0
                ? `${Number(trip.distance || 0).toFixed(1)} km`
                : 'N/A',
            alertsCount:
              typeof derivedAlerts === 'number'
                ? derivedAlerts
                : Number(trip.alertsCount || 0),
            riskScore: normalizeRisk(trip.riskScore),
            status: toStatusLabel(trip.status),
            location: {
              lat: vehicle?.lastLat,
              lng: vehicle?.lastLng,
            },
          }
        })

        setTrips(normalizedTrips)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch trips')
      } finally {
        setIsLoading(false)
      }
    }

    void loadTrips()
  }, [filterDriverId, filterVehicleId, onLogout, token, user?.email, user?.id])

  const openMap = (trip) => {
    if (typeof trip.location.lat !== 'number' || typeof trip.location.lng !== 'number') return
    window.open(
      `https://www.google.com/maps?q=${trip.location.lat},${trip.location.lng}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const hasTrips = useMemo(() => trips.length > 0, [trips.length])

  return (
    <section className="trips-page panel">
      <div className="panel__header trips-page__header">
        <div>
          <h2>Trips Management</h2>
          <p className="subtitle">
            Connect trips with drivers, vehicles, telemetry, alerts, and risk analytics.
          </p>
        </div>
      </div>

      {(filterDriverId || filterVehicleId) && (
        <div className="trips-filters">
          {filterDriverId && <p className="trips-filter-pill">Filtered Driver: {filterDriverId}</p>}
          {filterVehicleId && <p className="trips-filter-pill">Filtered Vehicle: {filterVehicleId}</p>}
          <button type="button" className="button button--ghost" onClick={() => navigate('/trips')}>
            Clear Filter
          </button>
        </div>
      )}

      {isLoading && <p className="loading-text">Loading trips...</p>}
      {!isLoading && error && <p className="error-text">{error}</p>}
      {!isLoading && !error && !hasTrips && (
        <p className="empty-message">No trips found for the current filters.</p>
      )}

      {!isLoading && !error && hasTrips && (
        <div className="trips-table-wrap">
          <table className="trips-table">
            <thead>
              <tr>
                <th>Trip ID</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Duration</th>
                <th>Distance</th>
                <th>Alerts Count</th>
                <th>Risk Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id}>
                  <td>{trip.idLabel}</td>
                  <td>{trip.driverName}</td>
                  <td>{trip.vehicleName}</td>
                  <td>{formatDateTime(trip.startTime)}</td>
                  <td>{formatDateTime(trip.endTime, 'In progress')}</td>
                  <td>{trip.duration}</td>
                  <td>{trip.distanceLabel}</td>
                  <td>{trip.alertsCount}</td>
                  <td>
                    <RiskBadge level={trip.riskScore} />
                  </td>
                  <td>
                    <TripStatusBadge status={trip.status} />
                  </td>
                  <td>
                    <div className="trips-actions">
                      <button
                        type="button"
                        className="button button--ghost trips-action-button"
                        onClick={() => navigate(`/trips/${trip.id}`)}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        className="button button--ghost trips-action-button"
                        onClick={() => navigate(`/drivers/${trip.driverId}`)}
                      >
                        View Driver
                      </button>
                      <button
                        type="button"
                        className="button button--ghost trips-action-button"
                        onClick={() => navigate(`/vehicles/${trip.vehicleId}`)}
                      >
                        View Vehicle
                      </button>
                      <button
                        type="button"
                        className="button button--ghost trips-action-button"
                        onClick={() => openMap(trip)}
                        disabled={
                          typeof trip.location.lat !== 'number' || typeof trip.location.lng !== 'number'
                        }
                      >
                        Open Map
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && hasTrips && (
        <div className="trip-cards">
          {trips.map((trip) => (
            <article key={trip.id} className="trip-card summary-card">
              <div className="trip-card__top">
                <div>
                  <p className="trip-card__id">{trip.idLabel}</p>
                  <p className="trip-card__entities">
                    {trip.driverName} · {trip.vehicleName}
                  </p>
                </div>
                <TripStatusBadge status={trip.status} />
              </div>

              <div className="trip-card__meta">
                <RiskBadge level={trip.riskScore} />
                <p className="trip-card__info">Alerts: {trip.alertsCount}</p>
              </div>

              <p className="trip-card__info">Start: {formatDateTime(trip.startTime)}</p>
              <p className="trip-card__info">End: {formatDateTime(trip.endTime, 'In progress')}</p>
              <p className="trip-card__info">Duration: {trip.duration}</p>
              <p className="trip-card__info">Distance: {trip.distanceLabel}</p>

              <div className="trips-actions trips-actions--stacked">
                <button
                  type="button"
                  className="button button--ghost trips-action-button"
                  onClick={() => navigate(`/trips/${trip.id}`)}
                >
                  View Details
                </button>
                <button
                  type="button"
                  className="button button--ghost trips-action-button"
                  onClick={() => navigate(`/drivers/${trip.driverId}`)}
                >
                  View Driver
                </button>
                <button
                  type="button"
                  className="button button--ghost trips-action-button"
                  onClick={() => navigate(`/vehicles/${trip.vehicleId}`)}
                >
                  View Vehicle
                </button>
                <button
                  type="button"
                  className="button button--ghost trips-action-button"
                  onClick={() => openMap(trip)}
                  disabled={typeof trip.location.lat !== 'number' || typeof trip.location.lng !== 'number'}
                >
                  Open Map
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default TripsPage
