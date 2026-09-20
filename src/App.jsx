"use client";

import { useState, useRef } from 'react';
import Catalog from './components/Catalog.jsx';
import GuidePopup from './components/GuidePopup.jsx';
import ReportPopup from './components/ReportPopup.jsx';
import SettingsPopup from './components/SettingsPopup.jsx';
import GeneralIssuesPopup from './components/GeneralIssuesPopup.jsx';
import ToolsPopup from './components/ToolsPopup.jsx';
import { initStore } from './data/store.js';

export default function App({ initialData }) {
  useState(() => {
    if (initialData) initStore(initialData);
  });

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIssuesOpen, setIsIssuesOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsBtnRef = useRef(null);
  const issuesBtnRef = useRef(null);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  const guideBtnRef = useRef(null);
  const reportBtnRef = useRef(null);
  const settingsBtnRef = useRef(null);

  return (
    <>
      <a className="skip-link" href="#catalog-content">Saltar al catálogo</a>
      <header className="site-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">w.</span><span>WalkingPad<span className="brand-caption">SUPPORT WORKSPACE</span></span></div>
        <span className="workspace-label">Tu espacio de soporte técnico</span>
      </header>
      <nav className="site-nav" aria-label="Navegación principal">
        <button className={!isReportOpen && !isGuideOpen && !isSettingsOpen && !isIssuesOpen && !isToolsOpen ? 'active' : ''} onClick={() => document.getElementById('catalog-content')?.focus()}>Catálogo</button>
        <button ref={issuesBtnRef} className={isIssuesOpen ? 'active' : ''} onClick={() => setIsIssuesOpen(true)}>Problemas generales</button>
        <button ref={guideBtnRef} className={isGuideOpen ? 'active' : ''} onClick={() => setIsGuideOpen(true)}>Guía</button>
        <button ref={toolsBtnRef} className={isToolsOpen ? 'active' : ''} onClick={() => setIsToolsOpen(true)}>Herramientas</button>
        <button ref={reportBtnRef} className={isReportOpen ? 'active' : ''} onClick={() => setIsReportOpen(true)}>Mi Reporte</button>
        <button ref={settingsBtnRef} className={isSettingsOpen ? 'active' : ''} onClick={() => setIsSettingsOpen(true)}>Ajustes</button>
      </nav>

      {message && <div role="status" className="notice">{message}</div>}
      <main className="catalog-main" id="catalog-content" tabIndex={-1} key={revision}>
        <div className="catalog-intro"><p className="eyebrow">SOPORTE TÉCNICO</p><h1>Encuentra tu modelo.</h1><p>Especificaciones y soluciones para cada consulta.</p></div>
        <Catalog notify={setMessage} />
      </main>

      <GuidePopup isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} triggerRef={guideBtnRef} />
      <ToolsPopup isOpen={isToolsOpen} onClose={() => setIsToolsOpen(false)} triggerRef={toolsBtnRef} />
      <GeneralIssuesPopup isOpen={isIssuesOpen} onClose={() => setIsIssuesOpen(false)} triggerRef={issuesBtnRef} />
      <ReportPopup isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} triggerRef={reportBtnRef} />
      <SettingsPopup isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} triggerRef={settingsBtnRef} onImportSuccess={() => setRevision(rev => rev + 1)} />
    </>
  );
}
