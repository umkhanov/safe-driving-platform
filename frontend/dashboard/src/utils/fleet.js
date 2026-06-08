const riskRank = {
  low: 1,
  medium: 2,
  high: 3,
}

export const normalizeList = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export const formatDateTime = (value, fallback = 'N/A') => {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString()
}

export const formatTimeAgo = (value, fallback = 'N/A') => {
  if (!value) return fallback
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return fallback

  const deltaMs = Date.now() - ts
  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export const formatDuration = (startedAt, endedAt) => {
  if (!startedAt) return 'N/A'

  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 'N/A'

  const minutes = Math.floor((end - start) / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60

  if (hours === 0) return `${remMinutes}m`
  return `${hours}h ${remMinutes}m`
}

export const formatLocationLabel = (lat, lng) => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'Unavailable'
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export const normalizeRisk = (value, fallback = 'Low') => {
  const normalized = String(value || fallback).toLowerCase()
  if (normalized === 'critical' || normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

export const maxRisk = (...values) => {
  const risks = values.map((item) => normalizeRisk(item))
  return risks.reduce((best, item) => {
    const bestRank = riskRank[best.toLowerCase()] || 1
    const itemRank = riskRank[item.toLowerCase()] || 1
    return itemRank > bestRank ? item : best
  }, 'Low')
}

export const riskFromAlarms = (alarms = []) => {
  const highCount = alarms.filter((alarm) => {
    const value = String(alarm.severity || '').toLowerCase()
    return value === 'critical' || value === 'high'
  }).length
  const mediumCount = alarms.filter(
    (alarm) => String(alarm.severity || '').toLowerCase() === 'medium',
  ).length

  if (highCount > 0 || alarms.length >= 6) return 'High'
  if (mediumCount > 0 || alarms.length >= 3) return 'Medium'
  return 'Low'
}

export const driverNameFromId = (driverId) => (driverId ? `Driver #${driverId}` : 'Unassigned')
export const vehicleNameFromId = (vehicleId) => (vehicleId ? `Car ${vehicleId}` : 'Unassigned')
