import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import {
  addMeshDevice,
  flushBridgeNodes,
  resetMeshState,
  runGossipRound,
  runGossipRounds,
  sendDemoPayment,
  simulateDuplicateStorm,
} from './api/dashboardApi.js';
import AccountPanel from './components/AccountPanel.jsx';
import ActivityFeed from './components/ActivityFeed.jsx';
import AppHeader from './components/AppHeader.jsx';
import DemoControls from './components/DemoControls.jsx';
import MeshNetwork from './components/MeshNetwork.jsx';
import PacketJourney from './components/PacketJourney.jsx';
import ServerKeyPanel from './components/ServerKeyPanel.jsx';
import StatStrip from './components/StatStrip.jsx';
import TransactionLedger from './components/TransactionLedger.jsx';
import { useDashboardData } from './hooks/useDashboardData.js';
import { shortId } from './utils/formatters.js';

const nowStamp = () => new Date().toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const initialActivity = [
  {
    id: 'initial',
    kind: 'system',
    time: nowStamp(),
    message: 'React dashboard connected.',
  },
];

const initialJourney = [
  {
    id: 'payment',
    label: 'Payment created',
    status: 'pending',
    detail: 'Waiting for a demo payment.',
  },
  {
    id: 'encrypted',
    label: 'Encrypted packet injected',
    status: 'pending',
    detail: 'No packet is currently in the mesh.',
  },
  {
    id: 'gossip',
    label: 'Gossip round completed',
    status: 'pending',
    detail: 'Run gossip to copy the packet across devices.',
  },
  {
    id: 'bridge',
    label: 'Bridge uploaded',
    status: 'pending',
    detail: 'Flush bridge nodes when a bridge holds the packet.',
  },
  {
    id: 'settlement',
    label: 'Settled / duplicate / rejected',
    status: 'pending',
    detail: 'Settlement result appears after bridge upload.',
  },
];

function summarizeFlush(result) {
  const counts = (result.results || []).reduce((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {});

  const detail = Object.entries(counts)
    .map(([key, value]) => `${value} ${key.toLowerCase()}`)
    .join(', ');

  return `${result.uploadsAttempted || 0} bridge upload${result.uploadsAttempted === 1 ? '' : 's'} processed${detail ? `: ${detail}` : ''}.`;
}

export default function App() {
  const { data, error, isLoading, isRefreshing, reload } = useDashboardData();
  const [activity, setActivity] = useState(initialActivity);
  const [journey, setJourney] = useState(initialJourney);
  const [runningAction, setRunningAction] = useState('');
  const [actionError, setActionError] = useState('');

  const stats = useMemo(() => {
    const devices = data.mesh?.devices || [];
    const totalPackets = devices.reduce((sum, device) => sum + Number(device.packetCount || 0), 0);
    const bridgeNodes = devices.filter((device) => device.hasInternet).length;
    const heldPacketIds = new Set(
      devices.flatMap((device) => device.packetIds || []),
    );

    return {
      devices: devices.length,
      bridgeNodes,
      totalPackets,
      uniquePackets: heldPacketIds.size,
      cacheSize: data.mesh?.idempotencyCacheSize || 0,
      ledgerRows: data.transactions?.length || 0,
    };
  }, [data]);

  const pushActivity = useCallback((message, kind = 'info') => {
    setActivity((items) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        time: nowStamp(),
        message,
      },
      ...items,
    ].slice(0, 16));
  }, []);

  const updateJourney = useCallback((updates) => {
    setJourney((steps) => steps.map((step) => (
      updates[step.id] ? { ...step, ...updates[step.id] } : step
    )));
  }, []);

  const runAction = useCallback(async (key, task, successMessage) => {
    setRunningAction(key);
    setActionError('');
    try {
      const result = await task();
      pushActivity(successMessage(result), 'success');
      await reload(true);
      return result;
    } catch (err) {
      const message = err.message || 'Action failed';
      setActionError(message);
      pushActivity(message, 'error');
      return null;
    } finally {
      setRunningAction('');
    }
  }, [pushActivity, reload]);

  const handleSendPayment = useCallback((payload) => {
    runAction(
      'send',
      () => sendDemoPayment(payload),
      (result) => `Packet ${shortId(result.packetId)} injected at ${result.injectedAt} with TTL ${result.ttl}.`,
    ).then((result) => {
      if (!result) return;
      setJourney(initialJourney);
      updateJourney({
        payment: {
          status: 'done',
          detail: `${payload.senderVpa} created a Rs. ${Number(payload.amount).toFixed(2)} payment for ${payload.receiverVpa}.`,
        },
        encrypted: {
          status: 'done',
          detail: `Packet ${shortId(result.packetId)} injected at ${result.injectedAt}.`,
        },
      });
    });
  }, [runAction, updateJourney]);

  const handleGossip = useCallback(() => {
    runAction(
      'gossip',
      runGossipRound,
      (result) => `Gossip moved ${result.transfers || 0} packet copies across the mesh.`,
    ).then((result) => {
      if (!result) return;
      updateJourney({
        gossip: {
          status: 'done',
          detail: `${result.rounds || 1} round moved ${result.transfers || 0} packet copies.`,
        },
      });
    });
  }, [runAction, updateJourney]);

  const handleGossipRounds = useCallback((rounds) => {
    runAction(
      'gossip-3',
      () => runGossipRounds(rounds),
      (result) => `${result.rounds || rounds} gossip rounds moved ${result.transfers || 0} packet copies.`,
    ).then((result) => {
      if (!result) return;
      updateJourney({
        gossip: {
          status: 'done',
          detail: `${result.rounds || rounds} rounds moved ${result.transfers || 0} packet copies.`,
        },
      });
    });
  }, [runAction, updateJourney]);

  const handleFlush = useCallback(() => {
    runAction('flush', flushBridgeNodes, summarizeFlush).then((result) => {
      if (!result) return;
      const outcomes = (result.results || []).map((item) => item.outcome);
      const status = outcomes.includes('SETTLED')
        ? 'SETTLED'
        : outcomes.includes('DUPLICATE_DROPPED')
          ? 'DUPLICATE_DROPPED'
          : outcomes[0] || 'NO_UPLOADS';
      updateJourney({
        bridge: {
          status: 'done',
          detail: `${result.uploadsAttempted || 0} bridge upload attempts reached the backend.`,
        },
        settlement: {
          status: 'done',
          detail: `Final observed outcome: ${status.replaceAll('_', ' ')}.`,
        },
      });
    });
  }, [runAction, updateJourney]);

  const handleReset = useCallback(() => {
    runAction('reset', resetMeshState, (result) => result.status || 'Mesh and cache reset.').then((result) => {
      if (result) setJourney(initialJourney);
    });
  }, [runAction]);

  const handleAddBridge = useCallback(() => {
    runAction(
      'add-bridge',
      () => addMeshDevice(true),
      (result) => `${result.device.deviceId} added as a bridge node.`,
    );
  }, [runAction]);

  const handleAddOffline = useCallback(() => {
    runAction(
      'add-offline',
      () => addMeshDevice(false),
      (result) => `${result.device.deviceId} added as an offline relay.`,
    );
  }, [runAction]);

  const handleDuplicateStorm = useCallback((payload) => {
    runAction(
      'duplicate-storm',
      () => simulateDuplicateStorm(payload),
      (result) => `Duplicate storm: ${result.uploadsAttempted || 0} bridge uploads, ${result.gossipTransfers || 0} gossip transfers.`,
    ).then((result) => {
      if (!result) return;
      const outcomes = (result.results || []).map((item) => item.outcome);
      const duplicates = outcomes.filter((outcome) => outcome === 'DUPLICATE_DROPPED').length;
      updateJourney({
        payment: {
          status: 'done',
          detail: `${payload.senderVpa} created a payment for ${payload.receiverVpa}.`,
        },
        encrypted: {
          status: 'done',
          detail: `Packet ${shortId(result.packetId)} injected at ${result.injectedAt}.`,
        },
        gossip: {
          status: 'done',
          detail: `${result.rounds || 2} rounds spread the same packet to bridge nodes.`,
        },
        bridge: {
          status: 'done',
          detail: `${result.uploadsAttempted || 0} bridges uploaded concurrently.`,
        },
        settlement: {
          status: 'done',
          detail: `Exactly-once result: ${outcomes.includes('SETTLED') ? '1 settled' : '0 settled'}, ${duplicates} duplicate drops.`,
        },
      });
    });
  }, [runAction, updateJourney]);

  return (
    <div className="app">
      <AppHeader isRefreshing={isRefreshing} />

      {error && (
        <div className="alert-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="icon-button" type="button" onClick={() => reload(false)} aria-label="Retry">
            <RefreshCcw size={16} />
          </button>
        </div>
      )}

      {isLoading ? (
        <main className="loading-state">
          <Loader2 className="spin" size={34} />
          <span>Loading dashboard</span>
        </main>
      ) : (
        <main className="dashboard-grid">
          <StatStrip stats={stats} />

          <section className="top-grid">
            <DemoControls
              accounts={data.accounts || []}
              devices={data.mesh?.devices || []}
              isBusy={Boolean(runningAction)}
              runningAction={runningAction}
              actionError={actionError}
              onSend={handleSendPayment}
              onGossip={handleGossip}
              onGossipRounds={handleGossipRounds}
              onFlush={handleFlush}
              onReset={handleReset}
              onAddBridge={handleAddBridge}
              onAddOffline={handleAddOffline}
              onDuplicateStorm={handleDuplicateStorm}
            />
            <MeshNetwork devices={data.mesh?.devices || []} />
          </section>

          <section className="content-grid">
            <PacketJourney steps={journey} />
            <AccountPanel accounts={data.accounts || []} />
          </section>

          <section className="ledger-grid">
            <TransactionLedger transactions={data.transactions || []} />
          </section>

          <section className="bottom-grid">
            <ActivityFeed items={activity} />
            <ServerKeyPanel serverKey={data.serverKey} />
          </section>
        </main>
      )}
    </div>
  );
}
