import StatusBadge from './StatusBadge'
import { formatAlarmKind } from '../utils/fleet'

const formatDate = (value) => {
  if (!value) return '-'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

const severityKind = (severity) => {
  const value = (severity || '').toLowerCase()

  if (value === 'critical') return 'critical'
  if (value === 'high') return 'danger'
  if (value === 'medium') return 'warning'
  if (value === 'low') return 'positive'
  return 'default'
}

function RecentAlarmsTable({ alarms }) {
  if (alarms.length === 0) {
    return <p className="empty-message">No alarms detected yet.</p>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Device</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {alarms.map((alarm) => (
            <tr
              key={alarm.id}
              className={(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alarm-row--critical' : ''}
            >
              <td>{alarm.id}</td>
              <td>
                <span className={(alarm.kind || '').toUpperCase() === 'CRASH_DETECTED' ? 'alarm-type--critical' : ''}>
                  {formatAlarmKind(alarm.kind || alarm.type)}
                </span>
              </td>
              <td>
                <StatusBadge
                  value={alarm.severity || 'unknown'}
                  kind={severityKind(alarm.severity)}
                />
              </td>
              <td>{alarm.deviceId ?? '-'}</td>
              <td>{formatDate(alarm.ts || alarm.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default RecentAlarmsTable
