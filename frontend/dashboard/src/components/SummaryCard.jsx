function SummaryCard({ title, value, tone = 'neutral' }) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <p className="summary-card__title">{title}</p>
      <p className="summary-card__value">{value}</p>
    </article>
  )
}

export default SummaryCard
