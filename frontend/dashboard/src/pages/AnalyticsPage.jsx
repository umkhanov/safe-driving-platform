import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import SummaryCard from '../components/SummaryCard'
import { ApiError, clearAuth, getAlarms, getTrips, getVehicles } from '../services/api'
import { maxRisk, normalizeList, normalizeRisk } from '../utils/fleet'

const chartColors = {
  low: 'var(--chart-pie-low)',
  medium: 'var(--chart-pie-medium)',
  high: 'var(--chart-pie-high)',
}

const riskFromSeverity = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'critical' || normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

const dayKey = (value) => {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const dayLabel = (isoDay) => {
  const date = new Date(`${isoDay}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return isoDay
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const withCount = (rows) => rows.filter((item) => Number(item.count || 0) > 0)

function AnalyticsPage({ token, user, onLogout }) {
  const [alarms, setAlarms] = useState([])
  const [trips, setTrips] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [alarmData, tripData, vehicleData] = await Promise.all([
          getAlarms(token),
          getTrips(token),
          getVehicles(token),
        ])

        setAlarms(normalizeList(alarmData))
        setTrips(normalizeList(tripData))
        setVehicles(normalizeList(vehicleData))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth()
          onLogout()
          return
        }
        setError(err.message || 'Failed to load analytics data')
      } finally {
        setIsLoading(false)
      }
    }

    void loadAnalytics()
  }, [onLogout, token])

  const analytics = useMemo(() => {
    const alertsByTypeMap = new Map()
    const alertsOverTimeMap = new Map()
    const riskDistributionMap = new Map([
      ['Low', 0],
      ['Medium', 0],
      ['High', 0],
    ])
    const vehicleActivityMap = new Map([
      ['Active', 0],
      ['Idle', 0],
      ['Warning', 0],
      ['Offline', 0],
    ])
    const tripStatsMap = new Map()
    const driverRiskMap = new Map()

    const upsertDriverRisk = (driverId, riskLevel) => {
      if (!driverId) return
      const current = driverRiskMap.get(driverId) || 'Low'
      driverRiskMap.set(driverId, maxRisk(current, riskLevel))
    }

    alarms.forEach((alarm) => {
      const type = alarm.kind || alarm.type || 'UNKNOWN'
      alertsByTypeMap.set(type, (alertsByTypeMap.get(type) || 0) + 1)

      const dateKey = dayKey(alarm.ts || alarm.createdAt)
      if (dateKey) {
        alertsOverTimeMap.set(dateKey, (alertsOverTimeMap.get(dateKey) || 0) + 1)
      }

      upsertDriverRisk(alarm.driverId, riskFromSeverity(alarm.severity))
    })

    trips.forEach((trip) => {
      const riskLevel = normalizeRisk(trip.riskScore)
      riskDistributionMap.set(riskLevel, (riskDistributionMap.get(riskLevel) || 0) + 1)
      upsertDriverRisk(trip.driverId, riskLevel)

      const dateKey = dayKey(trip.startedAt || trip.createdAt)
      if (dateKey) {
        const current = tripStatsMap.get(dateKey) || { trips: 0, distance: 0 }
        current.trips += 1
        current.distance += Number(trip.distance || 0)
        tripStatsMap.set(dateKey, current)
      }
    })

    vehicles.forEach((vehicle) => {
      const normalizedStatus = String(vehicle.status || 'Offline').toLowerCase()
      const status =
        normalizedStatus === 'active'
          ? 'Active'
          : normalizedStatus === 'idle'
            ? 'Idle'
            : normalizedStatus === 'warning'
              ? 'Warning'
              : 'Offline'
      vehicleActivityMap.set(status, (vehicleActivityMap.get(status) || 0) + 1)
      upsertDriverRisk(vehicle.currentDriverId, normalizeRisk(vehicle.riskLevel))
    })

    if (user?.role === 'driver' && user.id) {
      upsertDriverRisk(user.id, 'Low')
    }

    const alertsByType = withCount(
      [...alertsByTypeMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    )

    const alertsOverTime = withCount(
      [...alertsOverTimeMap.entries()]
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .slice(-10)
        .map(([isoDay, count]) => ({
          day: dayLabel(isoDay),
          count,
        })),
    )

    let riskDistribution = withCount(
      [...riskDistributionMap.entries()].map(([name, count]) => ({ name, count })),
    )
    if (riskDistribution.length === 0 && alarms.length > 0) {
      const alarmRiskMap = new Map([
        ['Low', 0],
        ['Medium', 0],
        ['High', 0],
      ])
      alarms.forEach((alarm) => {
        const risk = riskFromSeverity(alarm.severity)
        alarmRiskMap.set(risk, (alarmRiskMap.get(risk) || 0) + 1)
      })
      riskDistribution = withCount(
        [...alarmRiskMap.entries()].map(([name, count]) => ({ name, count })),
      )
    }

    const vehicleActivity = withCount(
      [...vehicleActivityMap.entries()].map(([name, count]) => ({ name, count })),
    )

    const tripStatistics = withCount(
      [...tripStatsMap.entries()]
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .slice(-10)
        .map(([isoDay, stat]) => ({
          day: dayLabel(isoDay),
          trips: stat.trips,
          distance: Number(stat.distance.toFixed(1)),
        })),
    )

    const highRiskDrivers = [...driverRiskMap.values()].filter((risk) => risk === 'High').length
    const activeVehicles = vehicles.filter(
      (vehicle) => String(vehicle.status || '').toLowerCase() === 'active',
    ).length

    return {
      totalTrips: trips.length,
      activeVehicles,
      totalAlerts: alarms.length,
      highRiskDrivers,
      alertsByType,
      alertsOverTime,
      riskDistribution,
      vehicleActivity,
      tripStatistics,
    }
  }, [alarms, trips, user, vehicles])

  if (isLoading) {
    return <p className="loading-text">Loading analytics data...</p>
  }

  if (error) {
    return (
      <section className="panel analytics-page">
        <h2>Analytics</h2>
        <p className="error-text">{error}</p>
      </section>
    )
  }

  return (
    <section className="analytics-page">
      <section className="summary-grid">
        <SummaryCard title="Total Trips" value={analytics.totalTrips} />
        <SummaryCard title="Active Vehicles" value={analytics.activeVehicles} />
        <SummaryCard title="Total Alerts" value={analytics.totalAlerts} />
        <SummaryCard title="High Risk Drivers" value={analytics.highRiskDrivers} tone="danger" />
      </section>

      <section className="analytics-grid">
        <article className="panel analytics-panel">
          <h2>Alerts by Type</h2>
          {analytics.alertsByType.length === 0 ? (
            <p className="empty-message">No alert type data yet.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.alertsByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--chart-cursor)' }}
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 10,
                    }}
                  />
                  <Bar dataKey="count" fill="var(--chart-bar)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel analytics-panel">
          <h2>Alerts Over Time</h2>
          {analytics.alertsOverTime.length === 0 ? (
            <p className="empty-message">No time-series alert data yet.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.alertsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="day" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-line)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel analytics-panel">
          <h2>Risk Distribution</h2>
          {analytics.riskDistribution.length === 0 ? (
            <p className="empty-message">No sufficient risk data yet</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={analytics.riskDistribution}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {analytics.riskDistribution.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={chartColors[String(entry.name || '').toLowerCase()] || 'var(--chart-bar)'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 10,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel analytics-panel">
          <h2>Vehicle Activity</h2>
          {analytics.vehicleActivity.length === 0 ? (
            <p className="empty-message">No vehicle activity data yet.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.vehicleActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 10,
                    }}
                  />
                  <Bar dataKey="count" fill="var(--chart-bar-alt)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel analytics-panel analytics-panel--wide">
          <h2>Trip Statistics</h2>
          {analytics.tripStatistics.length === 0 ? (
            <p className="empty-message">No trip statistics available yet.</p>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={analytics.tripStatistics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="day" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" allowDecimals={false} stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--chart-axis)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--chart-tooltip-border)',
                      borderRadius: 10,
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="trips" name="Trips" fill="var(--chart-bar)" radius={[6, 6, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="distance"
                    name="Distance (km)"
                    stroke="var(--chart-line)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </section>
    </section>
  )
}

export default AnalyticsPage
