import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function showStartupError(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const panel = document.createElement('pre');
  panel.style.cssText = 'padding:20px;color:#fff;background:#101923;white-space:pre-wrap;overflow-wrap:anywhere;font:14px monospace;';
  panel.textContent = 'PULSE STARTUP ERROR\n\n' + message;
  root.appendChild(panel);
}

window.addEventListener('error', (event) => {
  showStartupError(event.message || 'Unknown JavaScript error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  showStartupError(reason instanceof Error ? reason.stack || reason.message : String(reason));
});

(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');
  createRoot(root).render(<StrictMode><App /></StrictMode>);
} catch (error) {
  showStartupError(error instanceof Error ? error.stack || error.message : String(error));
}
