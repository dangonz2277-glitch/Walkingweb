import { useState, useEffect, useRef, useMemo } from 'react';
import Modal from './Modal.jsx';
import { getBaseProducts, getCategories, getIssues, getGeneralIssues, getProductIdentity } from '../data/store.js';
import { listCustomProducts, createCustomProduct, CatalogApiError } from '../data/catalogCustomProductClient.js';

const fields = [
  ['speed', 'Velocidad'], ['motor', 'Motor'], ['capacity', 'Capacidad'],
  ['area', 'Área'], ['weight', 'Peso'], ['folded', 'Plegado'],
  ['control', 'Control'], ['assembly', 'Ensamblaje'], ['notes', 'Notas']
];

const emptyForm = { cat: 'Vertical Fold', name: '', model: '', capacity: '', links: [], issues: [], speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '' };

export default function Catalog({ notify = () => {} }) {
  const [baseProducts] = useState(() => getBaseProducts().map(p => ({ ...p, isBase: true })));
  const [remoteProducts, setRemoteProducts] = useState([]);
  const [remoteError, setRemoteError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const pendingCreates = useRef(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expandedIdentity, setExpandedIdentity] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [requestId, setRequestId] = useState(null);

  const addBtnRef = useRef(null);
  const productTriggerRef = useRef(null);
  const [editTrigger, setEditTrigger] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setRemoteError(null);
      pendingCreates.current = [];
      try {
        const data = await listCustomProducts({ signal: controller.signal });
        const currentPending = pendingCreates.current || [];
        setRemoteProducts(() => {
          const fetchedIds = new Set(data.map(p => p.id));
          const newRemote = data.map(p => ({ ...p, isRemote: true }));
          for (const p of currentPending) {
            if (!fetchedIds.has(p.id)) {
              newRemote.unshift(p);
            }
          }
          return newRemote;
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setRemoteError(err.message || 'Error de conexión');
        }
      } finally {
        if (!controller.signal.aborted) {
          pendingCreates.current = null;
        }
      }
    };
    load();
    return () => controller.abort();
  }, [retryTrigger]);

  const allProducts = useMemo(() => {
    return [...remoteProducts, ...baseProducts];
  }, [remoteProducts, baseProducts]);

  const filtered = allProducts.filter(p => {
    if (category !== 'All' && p.cat !== category) return false;
    if (!query.trim()) return true;

    const term = query.toLowerCase().trim();
    const productIssues = p.isBase ? getIssues(p.issueKey) : (p.issues || []);

    const issueMatch = productIssues.some(iss =>
      (iss.code && iss.code.toLowerCase().includes(term)) ||
      (iss.name && iss.name.toLowerCase().includes(term)) ||
      (iss.fix && iss.fix.toLowerCase().includes(term)) ||
      (iss.parts && iss.parts.toLowerCase().includes(term))
    );

    const standardMatch = [p.name, p.model, p.speed, p.motor, p.notes, p.cat, p.capacity]
      .some(v => String(v || '').toLowerCase().includes(term));

    return issueMatch || standardMatch;
  });

  const filteredGeneralIssues = getGeneralIssues().filter(iss =>
    !query || [iss.code, iss.name, iss.fix].some(v => String(v || '').toLowerCase().includes(query.toLowerCase().trim()))
  );

  function startAdd() {
    setFormError('');
    setForm(emptyForm);
    setRequestId(crypto.randomUUID());
    setEditTrigger(addBtnRef);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    if (isSaving) return;
    setFormError('');

    if (!form.name.trim() || !form.model.trim() || !form.capacity.trim()) {
      setFormError('Nombre, modelo y capacidad son obligatorios.');
      return;
    }
    if (form.links.some(link => link.url && !/^https?:\/\//i.test(link.url))) {
      setFormError('Los enlaces deben comenzar con http:// o https://.');
      return;
    }

    if (form.issues.some(iss => (!iss.code?.trim() || !iss.name?.trim()))) {
      setFormError('El código y el nombre son obligatorios si agregas un error.');
      return;
    }

    const links = form.links.filter(link => link.url).map(link => ({ label: link.label || 'Enlace', url: link.url, price: link.price || '' }));
    const issues = form.issues.map(iss => ({ code: iss.code, name: iss.name, fix: iss.fix || '', parts: iss.parts || '' }));

    const productToSave = {
      cat: form.cat, name: form.name, model: form.model, capacity: form.capacity,
      speed: form.speed, motor: form.motor, area: form.area, weight: form.weight,
      folded: form.folded, control: form.control, assembly: form.assembly, notes: form.notes,
      links, issues
    };

    setIsSaving(true);
    try {
      const created = await createCustomProduct(productToSave, requestId);
      setRemoteProducts(prev => {
        const others = prev.filter(p => p.id !== created.id);
        return [{ ...created, isRemote: true }, ...others];
      });
      if (pendingCreates.current) {
        pendingCreates.current.push({ ...created, isRemote: true });
      }
      setEditing(false);
      setRequestId(null);
      notify('Producto compartido guardado.');
    } catch (err) {
      if (err instanceof CatalogApiError) {
        setFormError(`${err.message}${err.field ? ` (${err.field})` : ''}`);
      } else {
        setFormError('No se pudo guardar el producto.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="controls">
        <input type="search" aria-label="Buscar catálogo" placeholder="Buscar modelo, error, síntoma..." value={query} onChange={e => setQuery(e.target.value)} />
        <button ref={addBtnRef} onClick={startAdd}>+ Producto</button>
        <span className="result-count" aria-live="polite" aria-atomic="true">{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'} | {filteredGeneralIssues.length} {filteredGeneralIssues.length === 1 ? 'problema general' : 'problemas generales'}</span>
        <div className="tabs" role="group" aria-label="Filtrar por categoría">
          {getCategories().map(c =>
            <button key={c.key} aria-pressed={category === c.key} className={category === c.key ? 'active' : ''} onClick={() => setCategory(c.key)}>
              {c.label}
            </button>
          )}
        </div>
      </div>

      {remoteError && (
        <div className="error-notice" style={{ backgroundColor: '#fff3f3', padding: '1rem', marginBottom: '1rem', borderRadius: '4px', border: '1px solid #ffcaca' }}>
          <p style={{ color: '#d32f2f', margin: '0 0 0.5rem 0' }}>{remoteError}</p>
          <button onClick={() => setRetryTrigger(prev => prev + 1)}>Reintentar cargar compartidos</button>
        </div>
      )}

      <div className="grid">
        {filtered.map((p) => {
          const identity = getProductIdentity(p);
          const displayIssues = p.isBase ? getIssues(p.issueKey) : (p.issues || []);
          return (
          <article className="card" key={identity}>
            <button className="card-title" onClick={event => { productTriggerRef.current = event.currentTarget; setExpandedIdentity(identity); }} aria-haspopup="dialog" aria-expanded={expandedIdentity === identity}>
              <strong>{p.name}</strong> <span>{p.model}</span>
            </button>
            <small>{p.cat}{p.isRemote ? <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6b21a8', marginLeft: '0.5rem' }}>Compartido</span> : ''}</small>
            <p>{p.speed} · {p.capacity}</p>

            {expandedIdentity === identity && (
              <Modal isOpen={!editing} animateFromTrigger dismissOnBackdrop onClose={() => setExpandedIdentity(null)} triggerRef={productTriggerRef} title={`${p.name} · ${p.model}`} className="report-modal product-modal">
              <p className="popup-description">{p.cat}</p>
              <div className="detail">
                <div className="spec-grid">
                  {fields.filter(([k]) => p[k] && p[k] !== '—').map(([k, label]) => (
                    <div key={k}><small>{label}</small><div>{p[k]}</div></div>
                  ))}
                </div>
                <h3>Errores conocidos</h3>
                {displayIssues.length ? displayIssues.map((iss, idx) => (
                  <details key={iss.id || idx}>
                    <summary><b>{iss.code}</b> {iss.name}</summary>
                    <p className="preline">{iss.fix}</p>
                    {iss.parts && <p>Repuestos: {iss.parts}</p>}
                  </details>
                )) : <p>Sin errores específicos registrados.</p>}

                {p.links?.map((link, j) => (
                  <a key={j} href={/^https?:\/\//i.test(link.url) ? link.url : undefined} target="_blank" rel="noreferrer">
                    {link.label || link.url} {link.price ? `- ${link.price}` : ''}
                  </a>
                ))}
              </div>
              </Modal>
            )}
          </article>
          );
        })}
      </div>

      {!filtered.length && <p>Sin resultados.</p>}

      <Modal isOpen={editing} onClose={() => setEditing(false)} triggerRef={editTrigger} ariaLabelledBy="product-form-title">
        <form className="auth-form product-form" onSubmit={save}>
          <h2 id="product-form-title">Nuevo producto</h2>
          {formError && <div role="alert" className="error-notice" style={{color: 'red', marginBottom: '1rem'}}>{formError}</div>}

          <label>Nombre<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={isSaving} /></label>
          <label>Modelo<input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} disabled={isSaving} /></label>
          <label>Categoría
            <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} disabled={isSaving}>
              {getCategories().filter(c => c.key !== 'All').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>

          {fields.map(([key, label]) => (
            <label key={key}>{label}<input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} disabled={isSaving} /></label>
          ))}

          <h3>Problemas frecuentes (Opcional)</h3>
          {form.issues.map((iss, index) => (
            <div className="link-row" key={index} style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
              <input aria-label={`Código Error ${index + 1}`} placeholder="Código (ej. E01)" value={iss.code} onChange={e => setForm({ ...form, issues: form.issues.map((x, i) => i === index ? { ...x, code: e.target.value } : x) })} disabled={isSaving} />
              <input aria-label={`Nombre Error ${index + 1}`} placeholder="Nombre/Descripción" value={iss.name} onChange={e => setForm({ ...form, issues: form.issues.map((x, i) => i === index ? { ...x, name: e.target.value } : x) })} disabled={isSaving} />
              <textarea aria-label={`Solución Error ${index + 1}`} placeholder="Solución" value={iss.fix || ''} onChange={e => setForm({ ...form, issues: form.issues.map((x, i) => i === index ? { ...x, fix: e.target.value } : x) })} disabled={isSaving} />
              <input aria-label={`Repuestos Error ${index + 1}`} placeholder="Repuestos" value={iss.parts || ''} onChange={e => setForm({ ...form, issues: form.issues.map((x, i) => i === index ? { ...x, parts: e.target.value } : x) })} disabled={isSaving} />
              <button type="button" onClick={() => setForm({ ...form, issues: form.issues.filter((_, i) => i !== index) })} disabled={isSaving}>Quitar Error</button>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, issues: [...form.issues, { code: '', name: '', fix: '', parts: '' }] })} disabled={isSaving}>+ Error</button>

          <h3>Enlaces y precios</h3>
          {form.links.map((link, index) => (
            <div className="link-row" key={index}>
              <input aria-label={`Tienda ${index + 1}`} placeholder="Tienda" value={link.label} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, label: e.target.value } : x) })} disabled={isSaving} />
              <input aria-label={`URL ${index + 1}`} placeholder="https://..." value={link.url} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, url: e.target.value } : x) })} disabled={isSaving} />
              <input aria-label={`Precio ${index + 1}`} placeholder="Precio" value={link.price || ''} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, price: e.target.value } : x) })} disabled={isSaving} />
              <button type="button" onClick={() => setForm({ ...form, links: form.links.filter((_, i) => i !== index) })} disabled={isSaving}>Quitar</button>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, links: [...form.links, { label: '', url: '', price: '' }] })} disabled={isSaving}>+ Enlace</button>

          <p>Los precios se introducen manualmente. Consultarlos en una tienda requiere Internet.</p>
          <button type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar producto'}</button>
        </form>
      </Modal>
    </>
  );
}
