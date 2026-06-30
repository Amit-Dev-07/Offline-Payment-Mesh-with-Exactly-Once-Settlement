import { Activity, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  system: Activity,
  info: Info,
};

export default function ActivityFeed({ items }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Event stream</p>
          <h2>Activity</h2>
        </div>
      </div>

      <div className="activity-list">
        {items.map((item) => {
          const Icon = icons[item.kind] || Info;
          return (
            <article className={`activity-item ${item.kind}`} key={item.id}>
              <span className="activity-icon">
                <Icon size={16} />
              </span>
              <div>
                <time>{item.time}</time>
                <p>{item.message}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
