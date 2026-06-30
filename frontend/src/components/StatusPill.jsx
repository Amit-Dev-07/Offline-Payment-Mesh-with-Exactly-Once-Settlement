const statusClass = {
  SETTLED: 'settled',
  REJECTED: 'rejected',
  DUPLICATE_DROPPED: 'duplicate',
  INVALID: 'invalid',
};

export default function StatusPill({ status }) {
  const label = status || 'UNKNOWN';
  return (
    <span className={`status-pill ${statusClass[label] || 'neutral'}`}>
      {label.replaceAll('_', ' ')}
    </span>
  );
}
