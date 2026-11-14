import React from 'react';
import { TokenDemo } from './ui/TokenDemo';

export const App: React.FC = () => {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      <TokenDemo />
    </main>
  );
};

export default App;
