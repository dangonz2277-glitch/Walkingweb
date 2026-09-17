"use client";

import { useState, useRef } from 'react';
import Catalog from './components/Catalog.jsx';
import GuidePopup from './components/GuidePopup.jsx';
import ReportPopup from './components/ReportPopup.jsx';
import SettingsPopup from './components/SettingsPopup.jsx';
import { initStore } from './data/store.js';

export default function App({ initialData }) {
  useState(() => {
    if (initialData) initStore(initialData);
  });

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  const guideBtnRef = useRef(null);
  const reportBtnRef = useRef(null);
  const settingsBtnRef = useRef(null);

  return (
    <>
      <header>
        <h1>WalkingPad · Catálogo</h1>
        <p>Catálogo y soporte técnico</p>
      </header>
      <nav>
        <button className={!isReportOpen && !isGuideOpen && !isSettingsOpen ? 'active' : ''}>Catálogo</button>
        <button ref={guideBtnRef} className={isGuideOpen ? 'active' : ''} onClick={() => setIsGuideOpen(true)}>Guía</button>
        <button ref={reportBtnRef} className={isReportOpen ? 'active' : ''} onClick={() => setIsReportOpen(true)}>Mi Reporte</button>
        <button ref={settingsBtnRef} className={isSettingsOpen ? 'active' : ''} onClick={() => setIsSettingsOpen(true)}>Ajustes</button>
      </nav>

      {message && <div role="status" className="notice">{message}</div>}
      <main key={revision}>
        <Catalog notify={setMessage} />
      </main>

      <GuidePopup isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} triggerRef={guideBtnRef} />
      <ReportPopup isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} triggerRef={reportBtnRef} />
      <SettingsPopup isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} triggerRef={settingsBtnRef} onImportSuccess={() => setRevision(rev => rev + 1)} />
    </>
  );
}
