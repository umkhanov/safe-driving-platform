import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DriverStatusBadge from '../components/DriverStatusBadge'
import RiskBadge from '../components/RiskBadge'
import { ApiError, clearAuth, getAlarms, getTrips, getVehicles } from '../services/api'
import {
  driverNameFromId,
  formatTimeAgo,
  maxRisk,
  normalizeList,
  normalizeRisk,
  riskFromAlarms,
  vehicleNameFromId,
} from '../utils/fleet'

const labelFromEmail = (email) => {
  if (!email || !email.includes('@')) return 'Driver'
  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const licenseFromId = (id) => `LIC-${String(id).padStart(5, '0')}`

const latestTimestamp = (values) => {
  const stamps = values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => !Number.isNaN(value) && value > 0)
  return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null
}

const deriveDriverStatus = ({ totalTrips, totalAlerts, currentVehicle, activeTrip, riskScore }) => {
  if (activeTrip) return 'Driving'
  if (currentVehicle !== 'Unassigned' || totalTrips > 0 || totalAlerts > 0 || riskScore === 'High') {
    return 'Active'
  }
  return 'Offline'
}

function DriversPage({ token, user, onLogout }) {
  const navigate = useNavigate()
  const [drivers, setDrivers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadDrivers = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [tripData, alarmData, vehicleData] = await Promise.all([
          getTrips(token),
          getAlarms(token),
          getVehicles(token),
        ])

        const trips = normalizeList(tripData)
        const alarms = normalizeList(alarmData)
        const vehicles = normalizeList(vehicleData)

        const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
        const vehicleByDriver = new Map()
        vehicles.forEach((vehicle) => {
          if (vehicle.currentDriverId) vehicleByDriver.set(vehicle.currentDriverId, vehicle)
        })

        const driverIds = new Set()
        trips.forEach((trip) => {
          if (trip.driverId) driverIds.add(trip.driverId)
        })
        alarms.forEach((alarm) => {
          if (alarm.driverId) driverIds.add(alarm.driverId)
        })
        vehicles.forEach((vehicle) => {
          if (vehicle.currentDriverId) driverIds.add(vehicle.currentDriverId)
        })
        if (user?.role === 'driver' && user.id) {
          driverIds.add(user.id)
        }

        const computedDrivers = [...driverIds]
          .sort((a, b) => Number(a) - Number(b))
          .map((driverId) => {
            const driverTrips = trips.filter((trip) => trip.driverId === driverId)
            const driverAlarms = alarms.filter((alarm) => alarm.driverId === driverId)

            const currentVehicleRecord = vehicleByDriver.get(driverId)
            const fallbackVehicleId = driverTrips[0]?.vehicleId
            const fallbackVehicleRecord = vehicleById.get(fallbackVehicleId)
            const currentVehicle =
              currentVehicleRecord?.name ||
              fallbackVehicleRecord?.name ||
              vehicleNameFromId(fallbackVehicleId)

            const tripRisk = driverTrips.reduce(
              (current, trip) => maxRisk(current, normalizeRisk(trip.riskScore)),
              'Low',
            )
            const alarmRisk = riskFromAlarms(driverAlarms)
            const riskScore = maxRisk(tripRisk, alarmRisk)

            const activeTrip = driverTrips.some(
              (trip) => String(trip.status || '').toLowerCase() === 'active',
            )

            const lastActivityTs = latestTimestamp([
              currentVehicleRecord?.lastSeenAt,
              driverTrips[0]?.startedAt,
              driverTrips[0]?.endedAt,
              driverAlarms[0]?.ts,
            ])

            const displayName =
              driverId === user?.id ? labelFromEmail(user.email) || 'You' : driverNameFromId(driverId)
            const email =
              driverId === user?.id ? user.email : `driver${driverId}@fleet.local`

            return {
              id: driverId,
              name: displayName,
              email,
              licenseId: licenseFromId(driverId),
              status: deriveDriverStatus({
                totalTrips: driverTrips.length,
                totalAlerts: driverAlarms.length,
                currentVehicle,
                activeTrip,
                riskScore,
              }),
              totalTrips: driverTrips.length,
              totalAlerts: driverAlarms.length,
              riskScore,
              currentVehicle,
              lastActivity: formatTimeAgo(lastActivityTs, 'No activity yet'),
            }
          })

        setDrivers(computedDrivers)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch drivers')
      } finally {
        setIsLoading(false)
      }
    }

    void loadDrivers()
  }, [onLogout, token, user?.email, user?.id, user?.role])

  const hasDrivers = useMemo(() => drivers.length > 0, [drivers.length])

  return (
    <section className="drivers-page panel">
      <div className="panel__header drivers-page__header">
        <div>
          <h2>Driver & Customer Monitoring</h2>
          <p className="subtitle">
            Track rental driver behavior, risk trends, and recent trip safety activity.
          </p>
        </div>
      </div>

      {isLoading && <p className="loading-text">Loading drivers...</p>}
      {!isLoading && error && <p className="error-text">{error}</p>}
      {!isLoading && !error && !hasDrivers && (
        <p className="empty-message">No driver-related trip or alarm data is available yet.</p>
      )}

      {!isLoading && !error && hasDrivers && (
        <div className="drivers-table-wrap">
          <table className="drivers-table">
            <thead>
              <tr>
                <th>Driver Name</th>
                <th>Email</th>
                <th>License ID</th>
                <th>Status</th>
                <th>Total Trips</th>
                <th>Total Alerts</th>
                <th>Risk Score</th>
                <th>Current Vehicle</th>
                <th>Last Activity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  <td>{driver.name}</td>
                  <td>{driver.email}</td>
                  <td>{driver.licenseId}</td>
                  <td>
                    <DriverStatusBadge status={driver.status} />
                  </td>
                  <td>{driver.totalTrips}</td>
                  <td>{driver.totalAlerts}</td>
                  <td>
                    <RiskBadge level={driver.riskScore} />
                  </td>
                  <td>{driver.currentVehicle}</td>
                  <td>{driver.lastActivity}</td>
                  <td>
                    <div className="drivers-actions">
                      <button
                        type="button"
                        className="button button--ghost drivers-action-button"
                        onClick={() => navigate(`/drivers/${driver.id}`)}
                      >
                        View Profile
                      </button>
                      <button
                        type="button"
                        className="button button--ghost drivers-action-button"
                        onClick={() => navigate(`/trips?driverId=${driver.id}`)}
                      >
                        View Trips
                      </button>
                      <button
                        type="button"
                        className="button button--ghost drivers-action-button"
                        onClick={() => navigate(`/alerts?driverId=${driver.id}`)}
                      >
                        View Alerts
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && hasDrivers && (
        <div className="driver-cards">
          {drivers.map((driver) => (
            <article key={driver.id} className="driver-card summary-card">
              <div className="driver-card__top">
                <div>
                  <p className="driver-card__name">{driver.name}</p>
                  <p className="driver-card__email">{driver.email}</p>
                </div>
                <RiskBadge level={driver.riskScore} />
              </div>

              <div className="driver-card__meta">
                <DriverStatusBadge status={driver.status} />
                <span className="driver-card__license">{driver.licenseId}</span>
              </div>

              <p className="driver-card__info">Total Trips: {driver.totalTrips}</p>
              <p className="driver-card__info">Total Alerts: {driver.totalAlerts}</p>
              <p className="driver-card__info">Current Vehicle: {driver.currentVehicle}</p>
              <p className="driver-card__info">Last Activity: {driver.lastActivity}</p>

              <div className="drivers-actions drivers-actions--stacked">
                <button
                  type="button"
                  className="button button--ghost drivers-action-button"
                  onClick={() => navigate(`/drivers/${driver.id}`)}
                >
                  View Profile
                </button>
                <button
                  type="button"
                  className="button button--ghost drivers-action-button"
                  onClick={() => navigate(`/trips?driverId=${driver.id}`)}
                >
                  View Trips
                </button>
                <button
                  type="button"
                  className="button button--ghost drivers-action-button"
                  onClick={() => navigate(`/alerts?driverId=${driver.id}`)}
                >
                  View Alerts
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default DriversPage
