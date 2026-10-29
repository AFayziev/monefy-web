import { Show, SignInButton, UserButton } from '@clerk/react';
import { useEffect, useState } from 'react';
import { useApi } from './api';

function Landing() {
  return (
    <main>
      <h1>Monefy web viewer</h1>
      <p>Your expenses from the Monefy app, in one place.</p>
      <SignInButton />
    </main>
  );
}

function Home() {
  const api = useApi();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    api('/api/me')
      .then((r) => r.json() as Promise<{ userId: string }>)
      .then((d) => setUserId(d.userId))
      .catch(() => setUserId(null));
  }, [api]);

  return (
    <main>
      <header>
        <h1>Home</h1>
        <UserButton />
      </header>
      <p>Signed in as {userId ?? '…'}</p>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Show when="signed-out">
        <Landing />
      </Show>
      <Show when="signed-in">
        <Home />
      </Show>
    </>
  );
}
