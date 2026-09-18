import { useState } from 'react';
import { getGuide } from '../data/store.js';
export default function Guide() {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const sections = getGuide().map((section, index) => ({
    ...section, index,
    items: section.items.filter(item => `${item.q} ${item.a}`.toLowerCase().includes(term))
  })).filter(section => section.items.length);
  const total = sections.reduce((count, section) => count + section.items.length, 0);

  function jumpTo(index) {
    const heading = document.getElementById(`guide-section-${index}`);
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }

  return <section className="guide-workspace">
    <h2 id="guide-title">Guía de capacitación</h2>
    <p className="popup-description">Encuentra el procedimiento que necesitas para continuar tu consulta.</p>
    <div className="guide-search">
      <input type="search" aria-label="Buscar guía" placeholder="Buscar en la guía" value={query} onChange={event => setQuery(event.target.value)} />
      <p className="result-count" aria-live="polite">{total} {total === 1 ? 'respuesta' : 'respuestas'}</p>
    </div>
    {sections.length ? <div className="guide-layout">
      <aside className="guide-index" aria-label="Secciones de la guía">
        <p className="eyebrow">EN ESTA GUÍA</p>
        {sections.map(section => <button key={section.index} onClick={() => jumpTo(section.index)}>{section.sec}</button>)}
      </aside>
      <div className="guide-answers">{sections.map(section => <section key={section.index}>
        <h3 id={`guide-section-${section.index}`} tabIndex={-1}>{section.icon} {section.sec}</h3>
        {section.items.map(item => <details key={item.q} open={Boolean(term)}>
          <summary>{item.q}</summary><p className="preline">{item.a}</p>
        </details>)}
      </section>)}</div>
    </div> : <div className="guide-empty"><h3>No encontramos coincidencias</h3><p>Prueba con otro modelo, síntoma o palabra clave.</p><button onClick={() => setQuery('')}>Limpiar búsqueda</button></div>}
  </section>;
}
