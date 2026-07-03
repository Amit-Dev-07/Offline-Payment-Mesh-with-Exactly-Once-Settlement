async function request(path, options = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.error || response.statusText;
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return payload;
}

export async function fetchDashboardSnapshot() {
  const [mesh, accounts, transactions, serverKey] = await Promise.all([
    request('/api/mesh/state'),
    request('/api/accounts'),
    request('/api/transactions'),
    request('/api/server-key'),
  ]);

  return {
    mesh,
    accounts,
    transactions,
    serverKey,
  };
}

export function sendDemoPayment(payload) {
  return request('/api/demo/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runGossipRound() {
  return request('/api/mesh/gossip', { method: 'POST' });
}

export function runGossipRounds(rounds) {
  return request('/api/mesh/gossip-rounds', {
    method: 'POST',
    body: JSON.stringify({ rounds }),
  });
}

export function flushBridgeNodes() {
  return request('/api/mesh/flush', { method: 'POST' });
}

export function resetMeshState() {
  return request('/api/mesh/reset', { method: 'POST' });
}

export function addMeshDevice(hasInternet) {
  return request('/api/mesh/devices', {
    method: 'POST',
    body: JSON.stringify({ hasInternet }),
  });
}

export function simulateDuplicateStorm(payload) {
  return request('/api/mesh/duplicate-storm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
