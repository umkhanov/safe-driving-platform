import StatusBadge from './StatusBadge'

const getDriverStatusKind = (status) => {
  const normalized = String(status).toLowerCase()

  if (normalized === 'active') return 'positive'
  if (normalized === 'driving') return 'warning'
  if (normalized === 'suspended') return 'danger'
  return 'default'
}

function DriverStatusBadge({ status }) {
  return <StatusBadge value={status} kind={getDriverStatusKind(status)} />
}

export default DriverStatusBadge
