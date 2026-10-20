import React, { useEffect, useState } from 'react';
import { Cpu, AlertCircle, RefreshCw } from 'lucide-react';

export const AiStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<{
    engine: string;
    device?: string;
    modelLoaded?: boolean;
    online: boolean;
    status?: string;
    message: string;
  }>({
    engine: 'Qwen2.5-1.5B',
    online: true,
    message: 'Checking local extraction engine status...',
  });
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStatus = async (manual = false) => {
    if (manual) setLoading(true);
    try {
      const res = await fetch('/api/extraction-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({
          engine: 'Qwen2.5-1.5B',
          online: false,
          message: 'Local engine unavailable',
        });
      }
    } catch {
      setStatus({
        engine: 'Qwen2.5-1.5B',
        online: false,
        message: 'Local engine unavailable',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = window.setInterval(() => { void fetchStatus(); }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <button
      type="button"
      onClick={() => { void fetchStatus(true); }}
      title={status.message + ' Click to refresh.'}
      aria-label={status.message + ' Click to refresh.'}
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#D9D1C5] bg-[#F5F5F0] px-3 py-1.5 text-xs text-[#3E4234] transition-colors hover:bg-[#EBE7E0]"
    >
      <Cpu className="h-3.5 w-3.5 text-[#5A5A40]" />
      <span className="font-semibold text-[#3E4234]">Qwen2.5-1.5B</span>
      <span className="text-[#665F54]">•</span>
      {loading ? (
        <span className="flex items-center gap-1 text-[#665F54]">
          <RefreshCw className="h-3 w-3 animate-spin" /> Checking
        </span>
      ) : (
        <span className={'flex items-center gap-1.5 font-bold ' + (status.online && status.status !== 'ERROR' ? 'text-[#5A5A40]' : 'text-[#8C4A4A]')}>
          <span className="h-2 w-2 rounded-full bg-current"></span>
          {status.status === 'NOT_LOADED' ? 'LOADS ON FIRST USE' : (status.status || 'UNAVAILABLE').replaceAll('_', ' ')}
        </span>
      )}
    </button>
  );
};
