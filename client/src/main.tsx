import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The shell's own face, Hanken Grotesk, is linked from Google Fonts in index.html, as the dashboard does — so the UI face needs an external host now,
// and offline it falls back to Plus Jakarta Sans or the system face (an accepted trade: self-hosting it is out of scope for the redesign). The mono
// stays bundled because it has exactly one reader, a favorite's snapshot <pre>/<code>, which keeps the monospace the guide showed it in.
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
