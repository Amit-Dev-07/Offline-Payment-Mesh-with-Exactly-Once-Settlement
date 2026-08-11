import {
  Loader2,
  RadioTower,
  RefreshCcw,
  Repeat2,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function pickDefaultReceiver(vpas, sender) {
  return vpas.find((vpa) => vpa !== sender) || '';
}

export default function DemoControls({
  accounts,
  devices,
  isBusy,
  runningAction,
  actionError,
  onSend,
  onGossip,
  onGossipRounds,
  onFlush,
  onReset,
  onAddBridge,
  onAddOffline,
  onRemoveBridge,
  onRemoveOffline,
  onDuplicateStorm,
}) {
  const vpas = useMemo(() => accounts.map((account) => account.vpa), [accounts]);
  const deviceIds = useMemo(() => devices.map((device) => device.deviceId), [devices]);
  const [form, setForm] = useState({
    senderVpa: '',
    receiverVpa: '',
    amount: '500',
    pin: '1234',
    ttl: 5,
    startDevice: '',
  });

  useEffect(() => {
    setForm((current) => {
      const senderVpa = current.senderVpa || vpas[0] || '';
      const receiverVpa = current.receiverVpa || pickDefaultReceiver(vpas, senderVpa);
      const startDevice = deviceIds.includes(current.startDevice)
        ? current.startDevice
        : deviceIds[0] || 'phone-amit';

      return {
        ...current,
        senderVpa,
        receiverVpa,
        startDevice,
      };
    });
  }, [deviceIds, vpas]);

  const amount = Number(form.amount);
  const selectedSender = useMemo(
    () => accounts.find((account) => account.vpa === form.senderVpa),
    [accounts, form.senderVpa],
  );
  const senderBalance = Number(selectedSender?.balance || 0);
  const validationMessage = useMemo(() => {
    if (!form.senderVpa || !form.receiverVpa) return 'Select sender and receiver accounts.';
    if (form.senderVpa === form.receiverVpa) return 'Sender and receiver must be different.';
    if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be greater than zero.';
    if (amount > senderBalance) {
      return `${form.senderVpa} has only Rs. ${senderBalance.toFixed(2)} available. Reduce the amount.`;
    }
    if (form.pin.trim().length < 4) return 'PIN must be at least 4 digits.';
    if (!form.startDevice) return 'Select a start device before injecting the packet.';
    return '';
  }, [amount, form.pin, form.receiverVpa, form.senderVpa, form.startDevice, senderBalance]);
  const canSend = !validationMessage;

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const submitPayment = (event) => {
    event.preventDefault();
    if (!canSend || isBusy) return;

    onSend({
      senderVpa: form.senderVpa,
      receiverVpa: form.receiverVpa,
      amount,
      pin: form.pin.trim(),
      ttl: Number(form.ttl),
      startDevice: form.startDevice,
    });
  };

  const currentPayload = () => ({
    senderVpa: form.senderVpa,
    receiverVpa: form.receiverVpa,
    amount,
    pin: form.pin.trim(),
    ttl: Number(form.ttl),
    startDevice: form.startDevice,
  });

  const triggerDuplicateStorm = () => {
    if (!canSend || isBusy) return;
    onDuplicateStorm(currentPayload());
  };

  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Payment composer</p>
          <h2>Mesh transaction</h2>
        </div>
      </div>

      <form className="payment-form" onSubmit={submitPayment}>
        <label>
          Sender
          <select value={form.senderVpa} onChange={updateField('senderVpa')}>
            {vpas.map((vpa) => (
              <option value={vpa} key={vpa}>{vpa}</option>
            ))}
          </select>
        </label>

        <label>
          Receiver
          <select value={form.receiverVpa} onChange={updateField('receiverVpa')}>
            {vpas.map((vpa) => (
              <option value={vpa} key={vpa}>{vpa}</option>
            ))}
          </select>
        </label>

        <label>
          Amount
          <input
            type="number"
            min="1"
            step="1"
            value={form.amount}
            onChange={updateField('amount')}
          />
        </label>

        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            maxLength="6"
            value={form.pin}
            onChange={updateField('pin')}
          />
        </label>

        <label className="wide-control">
          Start device
          <select value={form.startDevice} onChange={updateField('startDevice')}>
            {deviceIds.map((deviceId) => (
              <option value={deviceId} key={deviceId}>{deviceId}</option>
            ))}
          </select>
        </label>

        <label className="ttl-control">
          TTL hops
          <span>{form.ttl}</span>
          <input
            type="range"
            min="1"
            max="8"
            value={form.ttl}
            onChange={updateField('ttl')}
          />
        </label>

        <button className="button primary wide-control" type="submit" disabled={!canSend || isBusy}>
          {runningAction === 'send' ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          Inject packet
        </button>
      </form>

      <div className="control-actions" aria-label="Mesh actions">
        <button className="button secondary" type="button" onClick={onGossip} disabled={isBusy}>
          {runningAction === 'gossip' ? <Loader2 className="spin" size={18} /> : <Repeat2 size={18} />}
          Gossip
        </button>
        <button className="button secondary" type="button" onClick={() => onGossipRounds(3)} disabled={isBusy}>
          {runningAction === 'gossip-3' ? <Loader2 className="spin" size={18} /> : <Repeat2 size={18} />}
          Run 3 rounds
        </button>
        <button className="button secondary" type="button" onClick={onFlush} disabled={isBusy}>
          {runningAction === 'flush' ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
          Flush bridges
        </button>
        <button className="button secondary" type="button" onClick={onAddOffline} disabled={isBusy}>
          {runningAction === 'add-offline' ? <Loader2 className="spin" size={18} /> : <Smartphone size={18} />}
          Add offline
        </button>
        <button className="button danger" type="button" onClick={onRemoveOffline} disabled={isBusy}>
          {runningAction === 'remove-offline' ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
          Delete offline
        </button>
        <button className="button secondary" type="button" onClick={onAddBridge} disabled={isBusy}>
          {runningAction === 'add-bridge' ? <Loader2 className="spin" size={18} /> : <RadioTower size={18} />}
          Add bridge
        </button>
        <button className="button danger" type="button" onClick={onRemoveBridge} disabled={isBusy}>
          {runningAction === 'remove-bridge' ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
          Delete bridge
        </button>
        <button className="button accent" type="button" onClick={triggerDuplicateStorm} disabled={!canSend || isBusy}>
          {runningAction === 'duplicate-storm' ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          Duplicate storm
        </button>
        <button className="button danger" type="button" onClick={onReset} disabled={isBusy}>
          {runningAction === 'reset' ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
          Reset
        </button>
      </div>

      {actionError && (
        <p className="form-note error-note">{actionError}</p>
      )}
      {validationMessage && (
        <p className="form-note">{validationMessage}</p>
      )}
    </section>
  );
}
