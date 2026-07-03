import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

const iconByStatus = {
  done: CheckCircle2,
  active: Loader2,
  pending: Circle,
};

export default function PacketJourney({ steps }) {
  return (
    <section className="panel journey-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Packet journey</p>
          <h2>Demo timeline</h2>
        </div>
      </div>

      <div className="journey-list">
        {steps.map((step, index) => {
          const Icon = iconByStatus[step.status] || Circle;
          return (
            <article className={`journey-step ${step.status}`} key={step.id}>
              <span className="journey-index">{index + 1}</span>
              <span className="journey-icon">
                <Icon size={16} className={step.status === 'active' ? 'spin' : ''} />
              </span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.detail}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
