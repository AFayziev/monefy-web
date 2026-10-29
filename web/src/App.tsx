import { useEffect, useState } from 'react';

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ ok: boolean }>)
      .then((d) => setApiOk(d.ok))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <main>
      <h1>monefy-web</h1>
      <p>API: {apiOk === null ? 'checking…' : apiOk ? 'ok' : 'unreachable'}</p>
    </main>
  );
}
