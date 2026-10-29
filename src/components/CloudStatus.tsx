import { useEffect, useState } from 'react';
import { syncStatus, syncNow } from '../storage/repository';
export function CloudStatus() {
  const [status, setStatus] = useState(syncStatus());
  useEffect(() => {
    const changed = () => setStatus(syncStatus());
    window.addEventListener('vocab:sync', changed);
    return () => window.removeEventListener('vocab:sync', changed);
  }, []);
  if (import.meta.env.VITE_OFFLINE === 'true')
    return (
      <div className="cloud-status" role="status">
        <span>Offline copy · saved on device</span>
      </div>
    );
  if (import.meta.env.VITE_HOSTED !== 'true') return null;
  return (
    <div className="cloud-status" role="status">
      <span>{status}</span>
      {/pending/i.test(status) && (
        <button className="text-button" onClick={() => void syncNow()}>
          Retry sync
        </button>
      )}
    </div>
  );
}
