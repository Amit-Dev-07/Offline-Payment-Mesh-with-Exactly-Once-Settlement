import { ReceiptText } from 'lucide-react';
import StatusPill from './StatusPill.jsx';
import { formatDateTime, formatMoney, shortId } from '../utils/formatters.js';

export default function TransactionLedger({ transactions }) {
  return (
    <section className="panel ledger-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Last 20 records</p>
          <h2>Transaction ledger</h2>
        </div>
        <ReceiptText size={20} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Route</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Bridge</th>
              <th>Hops</th>
              <th>Settled</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>#{transaction.id}</td>
                <td>
                  <span className="route-cell">{transaction.senderVpa}</span>
                  <span className="route-cell muted">to {transaction.receiverVpa}</span>
                </td>
                <td>{formatMoney(transaction.amount)}</td>
                <td><StatusPill status={transaction.status} /></td>
                <td>{transaction.bridgeNodeId}</td>
                <td>{transaction.hopCount}</td>
                <td>{formatDateTime(transaction.settledAt)}</td>
                <td><code>{shortId(transaction.packetHash, 10)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>

        {!transactions.length && (
          <div className="empty-state">No transactions settled yet.</div>
        )}
      </div>
    </section>
  );
}
