function RiskBadge({ level = 'Low' }) {
  const normalized = String(level).toLowerCase()
  const kind = normalized === 'high' ? 'high' : normalized === 'medium' ? 'medium' : 'low'

  return <span className={`risk-badge risk-badge--${kind}`}>{level}</span>
}

export default RiskBadge
