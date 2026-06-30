import { KeyRound, LockKeyhole } from 'lucide-react';

function fingerprint(publicKey) {
  if (!publicKey) return 'Waiting for key';
  return `${publicKey.slice(0, 20)}...${publicKey.slice(-12)}`;
}

export default function ServerKeyPanel({ serverKey }) {
  return (
    <section className="panel key-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Crypto</p>
          <h2>Server key</h2>
        </div>
        <KeyRound size={20} />
      </div>

      <div className="key-grid">
        <div className="key-row">
          <span>Algorithm</span>
          <strong>{serverKey?.algorithm || 'Unavailable'}</strong>
        </div>
        <div className="key-row">
          <span>Scheme</span>
          <strong>{serverKey?.hybridScheme || 'Unavailable'}</strong>
        </div>
        <div className="key-row code-row">
          <span>Public key</span>
          <code>{fingerprint(serverKey?.publicKey)}</code>
        </div>
      </div>

      <div className="key-footer">
        <LockKeyhole size={16} />
        <span>Ciphertext is deduplicated before settlement.</span>
      </div>
    </section>
  );
}
