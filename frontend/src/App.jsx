import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import {
  flushBridgeNodes,
  resetMeshState,
  runGossipRound,
  sendDemoPayment,
} from './api/dashboardApi.js';
import AccountPanel from './components/AccountPanel.jsx';
import ActivityFeed from './components/ActivityFeed.jsx';
import AppHeader from './components/AppHeader.jsx';
import DemoControls from './components/DemoControls.jsx';
import MeshNetwork from './components/MeshNetwork.jsx';
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
  const [runningAction, setRunningAction] = useState('');

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

  const runAction = useCallback(async (key, task, successMessage) => {
    setRunningAction(key);
    try {
      const result = await task();
      pushActivity(successMessage(result), 'success');
      await reload(true);
    } catch (err) {
      pushActivity(err.message || 'Action failed', 'error');
    } finally {
      setRunningAction('');
    }
  }, [pushActivity, reload]);

  const handleSendPayment = useCallback((payload) => {
    runAction(
      'send',
      () => sendDemoPayment(payload),
      (result) => `Packet ${shortId(result.packetId)} injected at ${result.injectedAt} with TTL ${result.ttl}.`,
    );
  }, [runAction]);

  const handleGossip = useCallback(() => {
    runAction(
      'gossip',
      runGossipRound,
      (result) => `Gossip moved ${result.transfers || 0} packet copies across the mesh.`,
    );
  }, [runAction]);

  const handleFlush = useCallback(() => {
    runAction('flush', flushBridgeNodes, summarizeFlush);
  }, [runAction]);

  const handleReset = useCallback(() => {
    runAction('reset', resetMeshState, (result) => result.status || 'Mesh and cache reset.');
  }, [runAction]);

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
              onSend={handleSendPayment}
              onGossip={handleGossip}
              onFlush={handleFlush}
              onReset={handleReset}
            />
            <MeshNetwork devices={data.mesh?.devices || []} />
          </section>

          <section className="content-grid">
            <AccountPanel accounts={data.accounts || []} />
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
