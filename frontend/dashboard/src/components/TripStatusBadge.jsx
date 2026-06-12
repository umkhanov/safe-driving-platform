import StatusBadge from './StatusBadge'

const getTripStatusKind = (status) => {
  const normalized = String(status).toLowerCase()

  if (normalized === 'active') return 'positive'
  if (normalized === 'completed') return 'default'
  if (normalized === 'warning') return 'warning'
  return 'danger'
}

function TripStatusBadge({ status }) {
  return <StatusBadge value={status} kind={getTripStatusKind(status)} />
}

export default TripStatusBadge
