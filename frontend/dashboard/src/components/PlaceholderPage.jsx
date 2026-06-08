function PlaceholderPage({ section, description }) {
  return (
    <div className="placeholder-page panel">
      <h2>{section}</h2>
      <p className="subtitle">{description}</p>
      <div className="placeholder-grid">
        <article className="summary-card">
          <p className="summary-card__title">Feature Status</p>
          <p className="summary-card__value">Available</p>
        </article>
        <article className="summary-card">
          <p className="summary-card__title">Data Integration</p>
          <p className="summary-card__value">Connected</p>
        </article>
      </div>
    </div>
  )
}

export default PlaceholderPage
