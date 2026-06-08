import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

const detailSections = [
  { title: 'Trip History', description: 'Recent and historical rental trips for this driver.' },
  { title: 'Dangerous Events', description: 'Hard brake, rapid acceleration, and sharp turn timeline.' },
  { title: 'Risk Statistics', description: 'Risk trend, safety score evolution, and alert distribution.' },
  { title: 'Average Speed', description: 'Average speed metrics by trip and over rolling periods.' },
  { title: 'Previous Rentals', description: 'Vehicle rental history and handover records.' },
  { title: 'Current Vehicle', description: 'Assigned vehicle details and live status placeholder.' },
]

const prettyNameFromEmail = (email) => {
  if (!email || !email.includes('@')) return null
  const base = email.split('@')[0]
  return base
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const latestTimestamp = (values) => {
  const parsed = values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => !Number.isNaN(value) && value > 0)
  return parsed.length ? new Date(Math.max(...parsed)).toISOString() : null
}

function DriverDetailsPage({ token, user, onLogout }) {
  const { driverId } = useParams()
  const [driver, setDriver] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const numericDriverId = useMemo(() => Number(driverId), [driverId])
  const isInvalidDriverId = Number.isNaN(numericDriverId)

  useEffect(() => {
    const loadDriverDetails = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [tripData, alarmData, vehicleData] = await Promise.all([
          getTrips(token, { driverId: numericDriverId }),
          getAlarms(token, { driverId: numericDriverId }),
          getVehicles(token),
        ])

        const trips = normalizeList(tripData)
        const alarms = normalizeList(alarmData)
        const vehicles = normalizeList(vehicleData)

        const assignedVehicle = vehicles.find((vehicle) => vehicle.currentDriverId === numericDriverId)
        const latestTrip = trips[0]

        const riskFromTrips = trips.reduce(
          (current, trip) => maxRisk(current, normalizeRisk(trip.riskScore)),
          'Low',
        )
        const riskScore = maxRisk(riskFromTrips, riskFromAlarms(alarms))

        const displayName =
          numericDriverId === user?.id
            ? prettyNameFromEmail(user.email) || 'You'
            : driverNameFromId(numericDriverId)
        const email =
          numericDriverId === user?.id ? user.email : `driver${numericDriverId}@fleet.local`
        const currentVehicle =
          assignedVehicle?.name ||
          vehicleNameFromId(latestTrip?.vehicleId) ||
          'Unassigned'
        const lastActivity = formatTimeAgo(
          latestTimestamp([
            latestTrip?.startedAt,
            latestTrip?.endedAt,
            alarms[0]?.ts,
            assignedVehicle?.lastSeenAt,
          ]),
          'No activity yet',
        )

        if (trips.length === 0 && alarms.length === 0 && !assignedVehicle && numericDriverId !== user?.id) {
          setDriver(null)
          return
        }

        setDriver({
          id: numericDriverId,
          name: displayName,
          email,
          licenseId: `LIC-${String(numericDriverId).padStart(5, '0')}`,
          currentVehicle,
          totalTrips: trips.length,
          totalAlerts: alarms.length,
          riskScore,
          lastActivity,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch driver details')
      } finally {
        setIsLoading(false)
      }
    }

    if (isInvalidDriverId) return undefined

    void loadDriverDetails()
  }, [isInvalidDriverId, numericDriverId, onLogout, token, user?.email, user?.id])

  if (isInvalidDriverId) {
    return (
      <div className="panel">
        <h2>Driver Profile</h2>
        <p className="subtitle">Invalid driver id.</p>
        <Link to="/drivers" className="inline-link">
          Back to Drivers
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return <p className="loading-text">Loading driver profile...</p>
  }

  if (error || !driver) {
    return (
      <div className="panel">
        <h2>Driver Profile</h2>
        <p className="subtitle">{error || `Driver #${driverId} was not found in backend data.`}</p>
        <Link to="/drivers" className="inline-link">
          Back to Drivers
        </Link>
      </div>
    )
  }

  return (
    <section className="driver-details-page">
      <article className="panel driver-details-page__header">
        <h2>{driver.name} Profile</h2>
        <p className="subtitle">{driver.email}</p>
        <p className="driver-details-page__meta">License: {driver.licenseId}</p>
        <p className="driver-details-page__meta">Current Vehicle: {driver.currentVehicle}</p>
        <p className="driver-details-page__meta">Total Trips: {driver.totalTrips}</p>
        <p className="driver-details-page__meta">Total Alerts: {driver.totalAlerts}</p>
        <p className="driver-details-page__meta">Risk Score: {driver.riskScore}</p>
        <p className="driver-details-page__meta">Last Activity: {driver.lastActivity}</p>
        <Link to="/drivers" className="inline-link">
          Back to Drivers
        </Link>
      </article>

      <div className="driver-details-grid">
        {detailSections.map((section) => (
          <article key={section.title} className="summary-card">
            <p className="summary-card__title">{section.title}</p>
            <p className="driver-details-page__placeholder">{section.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default DriverDetailsPage
