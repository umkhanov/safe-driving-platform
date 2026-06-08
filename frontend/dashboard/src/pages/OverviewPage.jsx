import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { useOutletContext } from 'react-router-dom'
import AlarmTypeChart from '../components/AlarmTypeChart'
import RecentAlarmsTable from '../components/RecentAlarmsTable'
import SummaryCard from '../components/SummaryCard'
import {
  API_BASE_URL,
  ApiError,
  clearAuth,
  getAlarms,
  getDevices,
} from '../services/api'

const normalizeList = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

const sortByNewest = (alarms) => {
  return [...alarms].sort((a, b) => {
    const aTime = new Date(a.ts || a.createdAt || 0).getTime()
    const bTime = new Date(b.ts || b.createdAt || 0).getTime()
    return bTime - aTime
  })
}

const highRiskCount = (alarms) => {
  return alarms.filter((alarm) => {
    const value = (alarm.severity || '').toLowerCase()
    return value === 'high' || value === 'critical'
  }).length
}

const systemStatus = ({ error, socketState }) => {
  if (error) return 'Attention Needed'
  if (socketState === 'connected') return 'Live Monitoring'
  return 'Operational'
}

function OverviewPage({ token, onLogout }) {
  const { setSocketState } = useOutletContext()

  const [alarms, setAlarms] = useState([])
  const [devices, setDevices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [localSocketState, setLocalSocketState] = useState('connecting')

  const updateSocketState = useCallback(
    (value) => {
      setLocalSocketState(value)
      setSocketState(value)
    },
    [setSocketState],
  )

  const loadDashboardData = useCallback(async () => {
    setError('')

    try {
      const [alarmData, deviceData] = await Promise.all([getAlarms(token), getDevices(token)])
      setAlarms(sortByNewest(normalizeList(alarmData)))
      setDevices(normalizeList(deviceData))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth()
        onLogout()
        return
      }
      setError(err.message || 'Failed to fetch dashboard data')
    } finally {
      setIsLoading(false)
    }
  }, [onLogout, token])

  useEffect(() => {
    Promise.resolve().then(loadDashboardData)
  }, [loadDashboardData])

  useEffect(() => {
    Promise.resolve().then(() => updateSocketState('connecting'))

    const socket = io(API_BASE_URL, {
      auth: { token },
      reconnection: true,
      transports: ['websocket', 'polling'],
    })

    const onAlarm = (incomingAlarm) => {
      setAlarms((prev) => {
        const exists = prev.some((item) => item.id === incomingAlarm.id)
        if (exists) {
          return prev
        }
        return sortByNewest([incomingAlarm, ...prev])
      })
    }

    socket.on('connect', () => updateSocketState('connected'))
    socket.on('disconnect', () => updateSocketState('disconnected'))
    socket.on('connect_error', () => updateSocketState('disconnected'))

    socket.on('alarm:new', onAlarm)
    socket.on('alarm:new_alarm', onAlarm)
    socket.on('alarm:newAlarm', onAlarm)

    return () => {
      socket.disconnect()
    }
  }, [token, updateSocketState])

  const summary = useMemo(() => {
    return {
      totalDevices: devices.length,
      totalAlarms: alarms.length,
      highRiskAlarms: highRiskCount(alarms),
      status: systemStatus({ error, socketState: localSocketState }),
    }
  }, [alarms, devices.length, error, localSocketState])

  const recentAlarms = alarms.slice(0, 8)

  if (isLoading) {
    return <p className="loading-text">Loading dashboard data...</p>
  }

  return (
    <>
      <section className="summary-grid">
        <SummaryCard title="Total Devices" value={summary.totalDevices} />
        <SummaryCard title="Total Alarms" value={summary.totalAlarms} />
        <SummaryCard title="High Risk Alarms" value={summary.highRiskAlarms} tone="danger" />
        <SummaryCard title="System Status" value={summary.status} tone="info" />
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel__header">
            <h2>Alarm Type Distribution</h2>
          </div>

          <AlarmTypeChart alarms={alarms} />
        </article>

        <article className="panel">
          <h2>Recent Alarms</h2>
          {error && <p className="error-text">{error}</p>}
          <RecentAlarmsTable alarms={recentAlarms} />
        </article>
      </section>
    </>
  )
}

export default OverviewPage
