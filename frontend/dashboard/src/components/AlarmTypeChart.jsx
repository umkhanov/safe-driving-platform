import { formatAlarmKind } from '../utils/fleet'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function AlarmTypeChart({ alarms }) {
  const counts = alarms.reduce((acc, alarm) => {
    const key = alarm.kind || alarm.type || 'UNKNOWN'
    if (key.toUpperCase() === 'CRASH_DETECTED') return acc
    const label = formatAlarmKind(key)
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})

  const chartData = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  if (chartData.length === 0) {
    return <p className="empty-message">No alarm data available for chart.</p>
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="name" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
          <YAxis
            allowDecimals={false}
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)' }}
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
            }}
          />
          <Bar dataKey="count" fill="var(--chart-bar)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default AlarmTypeChart
