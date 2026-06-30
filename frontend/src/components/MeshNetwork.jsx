import { RadioTower, Smartphone, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export default function MeshNetwork({ devices }) {
  const sortedDevices = useMemo(() => (
    [...devices].sort((a, b) => Number(a.hasInternet) - Number(b.hasInternet))
  ), [devices]);

  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!sortedDevices.length) {
      setSelectedId('');
      return;
    }

    setSelectedId((current) => (
      sortedDevices.some((device) => device.deviceId === current)
        ? current
        : sortedDevices[0].deviceId
    ));
  }, [sortedDevices]);

  const selectedDevice = sortedDevices.find((device) => device.deviceId === selectedId);

  return (
    <section className="panel mesh-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Virtual phones</p>
          <h2>Mesh topology</h2>
        </div>
      </div>

      <div className="mesh-board">
        <div className="mesh-line" aria-hidden="true" />
        {sortedDevices.map((device) => {
          const Icon = device.hasInternet ? RadioTower : Smartphone;
          const isSelected = selectedId === device.deviceId;

          return (
            <button
              className={`mesh-device ${device.hasInternet ? 'online' : 'offline'} ${isSelected ? 'selected' : ''}`}
              key={device.deviceId}
              type="button"
              onClick={() => setSelectedId(device.deviceId)}
            >
              <span className="device-icon">
                <Icon size={21} />
              </span>
              <span className="device-name">{device.deviceId}</span>
              <span className="device-status">
                {device.hasInternet ? '4G bridge' : 'Offline'}
              </span>
              <span className="packet-count">{device.packetCount || 0} packets</span>
            </button>
          );
        })}
      </div>

      <div className="mesh-detail">
        <div>
          <span className="detail-label">Selected node</span>
          <strong>{selectedDevice?.deviceId || 'No device'}</strong>
        </div>
        <div className="packet-list">
          {selectedDevice?.packetIds?.length ? (
            selectedDevice.packetIds.map((packetId) => (
              <span className="packet-chip" key={packetId}>{packetId}</span>
            ))
          ) : (
            <span className="empty-chip">
              <WifiOff size={14} />
              No packets held
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
