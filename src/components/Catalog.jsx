import { useState } from 'react';
import { getAllProducts, getCategories, getIssues, getGeneralIssues, saveLocalProduct, deleteLocalProduct } from '../data/store.js';

const fields = [
  ['speed', 'Velocidad'], ['motor', 'Motor'], ['capacity', 'Capacidad'], 
  ['area', 'Área'], ['weight', 'Peso'], ['folded', 'Plegado'], 
  ['control', 'Control'], ['assembly', 'Ensamblaje'], ['notes', 'Notas']
];

const emptyForm = { cat: 'Vertical Fold', name: '', model: '', capacity: '', links: [], notes: '' };

export default function Catalog({ notify }) {
  // Inicializamos directamente el estado para evitar el set-state-in-effect warning
  // typeof window asegura que en un hipotético SSR Next.js no rompa, 
  // aunque este componente es explícitamente cliente y usa localStorage
  const [products, setProducts] = useState(() => {
    return typeof window !== 'undefined' ? getAllProducts() : [];
  });
  const [query, setQuery] = useState(''); 
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState(null); 
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const filtered = products.filter(p => 
    (category === 'All' || p.cat === category) && 
    [p.name, p.model, p.speed, p.motor, p.notes, p.cat, p.capacity, ...getIssues(p.issueKey).flatMap(i => [i.code, i.name, i.fix])]
      .some(v => String(v || '').toLowerCase().includes(query.toLowerCase().trim()))
  );

  function startAdd() {
    setForm(emptyForm);
    setEditing(true);
  }

  function startEdit(p) {
    setForm({ ...p, links: p.links || [] });
    setEditing(true);
  }

  function handleRevert(product) {
    if (confirm('¿Seguro que deseas revertir este modelo base a su estado original?')) {
      if (deleteLocalProduct(product)) {
        setProducts(getAllProducts());
        notify('Producto revertido a base.');
      } else {
        notify('No se pudo revertir el producto.');
      }
    }
  }

  function handleDelete(product) {
    if (confirm('¿Seguro que deseas eliminar este producto local?')) {
      if (deleteLocalProduct(product)) {
        setProducts(getAllProducts());
        notify('Producto eliminado.');
      } else {
        notify('No se pudo eliminar el producto.');
      }
    }
  }

  function save(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.model.trim() || !form.capacity.trim()) {
      notify('Nombre, modelo y capacidad son obligatorios.');
      return;
    }
    if (form.links.some(link => link.url && !/^https?:\/\//i.test(link.url))) {
      notify('Los enlaces deben comenzar con http:// o https://.');
      return;
    }
    const links = form.links.filter(link => link.url).map(link => ({ ...link, label: link.label || 'Enlace' }));
    
    // We construct the product ensuring it retains issueKey if editing a base model
    const productToSave = { ...form, links };
    
    if (!saveLocalProduct(productToSave)) {
      notify('No se pudo guardar. Conservamos el formulario para reintentar.');
      return;
    }
    
    setProducts(getAllProducts());
    setEditing(false);
    notify('Producto guardado.');
  }

  return (
    <>
      <div className="controls">
        <input aria-label="Buscar catálogo" placeholder="Buscar modelo, error, síntoma..." value={query} onChange={e => setQuery(e.target.value)} />
        <button onClick={startAdd}>+ Producto</button>
        <span>{filtered.length} productos</span>
        <div className="tabs">
          {getCategories().map(c => 
            <button key={c.key} className={category === c.key ? 'active' : ''} onClick={() => setCategory(c.key)}>
              {c.label}
            </button>
          )}
        </div>
      </div>
      
      <div className="grid">
        {filtered.map((p, i) => (
          <article className="card" key={`${p.model || p.name}-${i}`}>
            <button className="card-title" onClick={() => setExpanded(expanded === p ? null : p)} aria-expanded={expanded === p}>
              <strong>{p.name}</strong> <span>{p.model}</span>
            </button>
            <small>{p.cat}{p.isOverride ? ' · Override Local' : (p.isCustom ? ' · Local' : '')}</small>
            <p>{p.speed} · {p.capacity}</p>
            
            {expanded === p && (
              <div className="detail">
                <div className="action-row">
                  <button onClick={() => startEdit(p)}>Editar</button>
                  {p.isOverride && <button onClick={() => handleRevert(p)}>Revertir a base</button>}
                  {p.isCustom && !p.isOverride && <button onClick={() => handleDelete(p)}>Eliminar</button>}
                </div>
                <div className="spec-grid">
                  {fields.filter(([k]) => p[k] && p[k] !== '—').map(([k, label]) => (
                    <div key={k}><small>{label}</small><div>{p[k]}</div></div>
                  ))}
                </div>
                <h3>Errores conocidos</h3>
                {getIssues(p.issueKey).length ? getIssues(p.issueKey).map(iss => (
                  <details key={iss.id}>
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
            )}
          </article>
        ))}
      </div>
      
      {!filtered.length && <p>Sin resultados.</p>}
      
      {!query && (
        <section>
          <h2>Problemas generales</h2>
          <div className="grid">
            {getGeneralIssues().map((issue, i) => (
              <details className="card" key={i}>
                <summary>{issue.code} · {issue.name}</summary>
                <p>{issue.fix}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <div className="overlay">
          <form className="panel" onSubmit={save}>
            <div className="panel-head">
              <h2>{form.isCustom || form.isOverride ? 'Editar' : 'Nuevo'} producto</h2>
              <button type="button" onClick={() => setEditing(false)}>Cerrar</button>
            </div>
            
            <label>Nombre<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Modelo<input value={form.model} readOnly={!!(form.isCustom || form.isOverride || products.some(p => p.model === form.model))} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
            <label>Categoría
              <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
                {getCategories().filter(c => c.key !== 'All').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            
            {fields.map(([key, label]) => (
              <label key={key}>{label}<input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>
            ))}
            
            <h3>Enlaces y precios</h3>
            {form.links.map((link, index) => (
              <div className="link-row" key={index}>
                <input aria-label={`Tienda ${index + 1}`} placeholder="Tienda" value={link.label} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, label: e.target.value } : x) })} />
                <input aria-label={`URL ${index + 1}`} placeholder="https://..." value={link.url} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, url: e.target.value } : x) })} />
                <input aria-label={`Precio ${index + 1}`} placeholder="Precio" value={link.price || ''} onChange={e => setForm({ ...form, links: form.links.map((x, i) => i === index ? { ...x, price: e.target.value } : x) })} />
                <button type="button" onClick={() => setForm({ ...form, links: form.links.filter((_, i) => i !== index) })}>Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, links: [...form.links, { label: '', url: '', price: '' }] })}>+ Enlace</button>
            
            <p>Los precios se introducen manualmente. Consultarlos en una tienda requiere Internet.</p>
            <button>Guardar producto</button>
          </form>
        </div>
      )}
    </>
  );
}
