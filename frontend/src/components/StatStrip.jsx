import { DatabaseZap, PackageCheck, ReceiptText, RadioTower, Smartphone } from 'lucide-react';

const statItems = [
  { key: 'devices', label: 'Devices', icon: Smartphone, tone: 'green' },
  { key: 'bridgeNodes', label: 'Bridges', icon: RadioTower, tone: 'teal' },
  { key: 'totalPackets', label: 'Held packets', icon: PackageCheck, tone: 'blue' },
  { key: 'cacheSize', label: 'Cache keys', icon: DatabaseZap, tone: 'amber' },
  { key: 'ledgerRows', label: 'Ledger rows', icon: ReceiptText, tone: 'rose' },
];

export default function StatStrip({ stats }) {
  return (
    <section className="stat-strip" aria-label="Dashboard summary">
      {statItems.map(({ key, label, icon: Icon, tone }) => (
        <div className={`stat-card tone-${tone}`} key={key}>
          <div className="stat-icon">
            <Icon size={19} />
          </div>
          <div>
            <span>{label}</span>
            <strong>{stats[key] ?? 0}</strong>
          </div>
        </div>
      ))}
    </section>
  );
}
