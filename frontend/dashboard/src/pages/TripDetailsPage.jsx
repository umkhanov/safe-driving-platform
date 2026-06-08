import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RiskBadge from '../components/RiskBadge'
import TripStatusBadge from '../components/TripStatusBadge'
import { ApiError, clearAuth, getAlarms, getTripById, getVehicles } from '../services/api'
import {
  driverNameFromId,
  formatDuration,
  normalizeList,
  normalizeRisk,
  vehicleNameFromId,
} from '../utils/fleet'

const detailSections = [
  {
    title: 'Trip Summary',
    description: 'Overview of duration, distance, route quality, and rental outcome.',
  },
  {
    title: 'Alerts Timeline',
    description: 'Chronological list of generated alerts across the trip window.',
  },
  {
    title: 'GPS/Location Events',
    description: 'Location pings, geofence triggers, and idle/stop location markers.',
  },
  {
    title: 'Telemetry Statistics',
    description: 'Aggregated accelerometer and GPS metrics for this trip.',
  },
  {
    title: 'Driving Behavior Summary',
    description: 'Behavior highlights including braking, acceleration, and turn patterns.',
  },
  {
    title: 'Route/Map Placeholder',
    description: 'Future map replay area with route path and event overlays.',
  },
  {
    title: 'Trip Risk Analysis',
    description: 'Risk scoring logic output, trends, and mitigation recommendations.',
  },
]

const toStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'Active'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'warning') return 'Warning'
  return 'Interrupted'
}

function TripDetailsPage({ token, user, onLogout }) {
  const { tripId } = useParams()
  const [trip, setTrip] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const numericTripId = useMemo(() => Number(tripId), [tripId])
  const isInvalidTripId = Number.isNaN(numericTripId)

  useEffect(() => {
    const loadTrip = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [tripData, vehicleData, alarmData] = await Promise.all([
          getTripById(token, numericTripId),
          getVehicles(token),
          getAlarms(token, { tripId: numericTripId }),
        ])

        const vehicles = normalizeList(vehicleData)
        const vehicle = vehicles.find((item) => item.id === tripData.vehicleId)
        const alarms = normalizeList(alarmData)

        setTrip({
          ...tripData,
          idLabel: `TRP-${tripData.id}`,
          driverName:
            tripData.driverId === user?.id
              ? `You (${user.email})`
              : driverNameFromId(tripData.driverId),
          vehicleName: vehicle?.name || vehicleNameFromId(tripData.vehicleId),
          duration: formatDuration(tripData.startedAt, tripData.endedAt),
          distanceKm: Number(tripData.distance || 0),
          riskScore: normalizeRisk(tripData.riskScore),
          status: toStatusLabel(tripData.status),
          alertCount: alarms.length,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch trip details')
      } finally {
        setIsLoading(false)
      }
    }

    if (isInvalidTripId) return undefined

    void loadTrip()
  }, [isInvalidTripId, numericTripId, onLogout, token, user?.email, user?.id])

  if (isInvalidTripId) {
    return (
      <div className="panel">
        <h2>Trip Details</h2>
        <p className="subtitle">Invalid trip id.</p>
        <Link to="/trips" className="inline-link">
          Back to Trips
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return <p className="loading-text">Loading trip details...</p>
  }

  if (error || !trip) {
    return (
      <div className="panel">
        <h2>Trip Details</h2>
        <p className="subtitle">{error || `Trip ${tripId} was not found in backend data.`}</p>
        <Link to="/trips" className="inline-link">
          Back to Trips
        </Link>
      </div>
    )
  }

  return (
    <section className="trip-details-page">
      <article className="panel trip-details-page__header">
        <h2>{trip.idLabel} Overview</h2>
        <div className="trip-details-page__meta-row">
          <TripStatusBadge status={trip.status} />
          <RiskBadge level={trip.riskScore} />
        </div>
        <p className="trip-details-page__meta">Driver: {trip.driverName}</p>
        <p className="trip-details-page__meta">Vehicle: {trip.vehicleName}</p>
        <p className="trip-details-page__meta">Duration: {trip.duration}</p>
        <p className="trip-details-page__meta">Distance: {trip.distanceKm.toFixed(1)} km</p>
        <p className="trip-details-page__meta">Alerts: {trip.alertCount}</p>
        <Link to="/trips" className="inline-link">
          Back to Trips
        </Link>
      </article>

      <div className="trip-details-grid">
        {detailSections.map((section) => (
          <article key={section.title} className="summary-card">
            <p className="summary-card__title">{section.title}</p>
            <p className="trip-details-page__placeholder">{section.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default TripDetailsPage
