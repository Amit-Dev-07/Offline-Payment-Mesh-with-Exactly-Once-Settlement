import { RadioTower, RefreshCw, ShieldCheck } from 'lucide-react';

export default function AppHeader({ isRefreshing }) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <RadioTower size={24} />
        </div>
        <div>
          <p className="eyebrow">Offline settlement simulator</p>
          <h1>UPI Offline Mesh - Live Demo</h1>
        </div>
      </div>

      <div className="header-actions">
        <span className="sync-pill">
          <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
          Live sync
        </span>
        <span className="trust-pill">
          <ShieldCheck size={15} />
          Encrypted packets
        </span>
      </div>
    </header>
  );
}
