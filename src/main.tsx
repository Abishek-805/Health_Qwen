import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Browsers reject relative fetch URLs when credentials remain in the address.
const currentUrl = new URL(location.href);
if (currentUrl.username || currentUrl.password) history.replaceState(null, '', location.origin + location.pathname + location.search + location.hash);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
