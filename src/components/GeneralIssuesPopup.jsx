import { useState } from 'react';
import Modal from './Modal.jsx';
import { getGeneralIssues } from '../data/store.js';

export default function GeneralIssuesPopup({ isOpen, onClose, triggerRef }) {
  const [query, setQuery] = useState('');
  const issues = getGeneralIssues().filter(issue =>
    [issue.code, issue.name, issue.fix].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase()))
  );
  return (
    <Modal isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} title="Problemas generales" className="report-modal knowledge-modal">
      <p className="popup-description">Soluciones comunes para tu consulta de soporte.</p>
      <input className="knowledge-search" type="search" aria-label="Buscar problemas generales" placeholder="Buscar síntoma o código…" value={query} onChange={event => setQuery(event.target.value)} />
      <p className="result-count" aria-live="polite">{issues.length} resultados</p>
      {issues.map((issue, index) => <details key={index} open={query.trim() ? true : undefined}>
        <summary><strong>{issue.code}</strong> · {issue.name}</summary>
        <p className="preline">{issue.fix}</p>
      </details>)}
      {!issues.length && <p>No hay coincidencias. Prueba otro síntoma o código.</p>}
    </Modal>
  );
}
