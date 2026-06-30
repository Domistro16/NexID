export default function Loading() {
  return (
    <section className="view active route-loading" aria-live="polite" aria-busy="true">
      <div className="route-loading-panel">
        <span className="route-loading-kicker">Loading</span>
        <div className="route-loading-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
    </section>
  );
}
