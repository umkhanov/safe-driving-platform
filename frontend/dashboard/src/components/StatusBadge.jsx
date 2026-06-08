function StatusBadge({ value, kind = 'default', pulse = false, className = '' }) {
  return (
    <span className={`status-badge status-badge--${kind} ${className}`.trim()}>
      {pulse && <span className="status-badge__dot" aria-hidden="true" />}
      {value}
    </span>
  )
}

export default StatusBadge
