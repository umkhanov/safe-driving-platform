import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PlaceholderPage from '../components/PlaceholderPage'
import { ApiError, clearAuth, getAlarms, getTrips, getVehicleById } from '../services/api'
import { formatLocationLabel, formatTimeAgo, normalizeList, normalizeRisk } from '../utils/fleet'

function VehicleDetailsPage({ token, onLogout }) {
  const { vehicleId } = useParams()
  const [vehicle, setVehicle] = useState(null)
  const [summary, setSummary] = useState({ tripCount: 0, alertCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadVehicle = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [vehicleData, tripData, alarmData] = await Promise.all([
          getVehicleById(token, vehicleId),
          getTrips(token, { vehicleId }),
          getAlarms(token, { vehicleId }),
        ])
        setVehicle({
          ...vehicleData,
          riskLevel: normalizeRisk(vehicleData.riskLevel),
          locationLabel: formatLocationLabel(vehicleData.lastLat, vehicleData.lastLng),
          lastSeenLabel: formatTimeAgo(vehicleData.lastSeenAt, 'No telemetry yet'),
        })
        setSummary({
          tripCount: normalizeList(tripData).length,
          alertCount: normalizeList(alarmData).length,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to fetch vehicle details')
      } finally {
        setIsLoading(false)
      }
    }

    void loadVehicle()
  }, [onLogout, token, vehicleId])

  if (isLoading) {
    return <p className="loading-text">Loading vehicle details...</p>
  }

  if (error || !vehicle) {
    return (
      <div className="panel">
        <h2>Vehicle Details</h2>
        <p className="subtitle">{error || `Vehicle #${vehicleId} was not found.`}</p>
        <Link to="/vehicles" className="inline-link">
          Back to Vehicles
        </Link>
      </div>
    )
  }

  return (
    <div className="vehicle-details-page">
      <div className="panel vehicle-details-page__header">
        <h2>{vehicle.name} Details</h2>
        <p className="subtitle">Status: {vehicle.status || 'Unknown'}</p>
        <p className="driver-details-page__meta">Risk Level: {vehicle.riskLevel}</p>
        <p className="driver-details-page__meta">Last Activity: {vehicle.lastSeenLabel}</p>
        <p className="driver-details-page__meta">Last Location: {vehicle.locationLabel}</p>
        <p className="driver-details-page__meta">Trips Recorded: {summary.tripCount}</p>
        <p className="driver-details-page__meta">Alerts Recorded: {summary.alertCount}</p>
        <Link to="/vehicles" className="inline-link">
          Back to Vehicles
        </Link>
      </div>

      <PlaceholderPage
        section={`Vehicle #${vehicle.id}`}
        description="Future expansion area: live telemetry stream, maintenance history, assigned trip timeline, and behavior scorecards."
      />
    </div>
  )
}

export default VehicleDetailsPage
