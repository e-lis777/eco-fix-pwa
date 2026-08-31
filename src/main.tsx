import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ReportForm } from '../app/report-form';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReportForm />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
