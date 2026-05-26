export function EmptyState({
  title,
  copy,
  action,
  label
}: {
  title: string;
  copy: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{copy}</p>
      {action && label ? <button className="primary" onClick={action}>{label}</button> : null}
    </div>
  );
}
