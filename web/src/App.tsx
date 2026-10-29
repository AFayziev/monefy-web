import { Show } from '@clerk/react';
import AppLayout from './layout/AppLayout';
import Landing from './pages/Landing';

export default function App() {
  return (
    <>
      <Show when="signed-out">
        <Landing />
      </Show>
      <Show when="signed-in">
        <AppLayout />
      </Show>
    </>
  );
}
