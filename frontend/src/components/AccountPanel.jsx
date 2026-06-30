import { Landmark } from 'lucide-react';
import { formatMoney } from '../utils/formatters.js';

export default function AccountPanel({ accounts }) {
  const maxBalance = Math.max(
    1,
    ...accounts.map((account) => Number(account.balance || 0)),
  );

  return (
    <section className="panel accounts-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Bank ledger</p>
          <h2>Accounts</h2>
        </div>
        <Landmark size={20} />
      </div>

      <div className="account-list">
        {accounts.map((account) => {
          const balance = Number(account.balance || 0);
          const width = `${Math.max(8, Math.round((balance / maxBalance) * 100))}%`;

          return (
            <article className="account-row" key={account.vpa}>
              <div className="account-title">
                <strong>{account.holderName}</strong>
                <span>{account.vpa}</span>
              </div>
              <div className="account-balance">
                <span>{formatMoney(account.balance)}</span>
                <div className="balance-meter" aria-hidden="true">
                  <i style={{ width }} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
