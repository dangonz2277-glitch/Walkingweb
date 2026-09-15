import { buildIssues } from './issues.js';
import { loadArray, saveArray } from './storage.js';

let categories = [];
let products = [];
let guide = {};
let generalIssues = [];
let issues = {};

export const initStore = (data) => {
  if (!data) return;
  if (data.categories) categories = data.categories;
  if (data.products) products = data.products;
  if (data.guide) guide = data.guide;
  if (data.generalIssues) generalIssues = data.generalIssues;
  if (data.sourceIssues) issues = buildIssues(data.sourceIssues);
};

export const getCategories = () => categories;
export const getGuide = () => guide;
export const getGeneralIssues = () => generalIssues;
export const getIssues = key => [...new Map((key || '').split(',').flatMap(k => issues[k.trim()] || []).map(i => [i.id, i])).values()];
export const getProductIdentity = p => {
  if (p.baseId) return p.baseId;
  if (p.id) return `id:${p.id}`;
  // Identidad de respaldo para versiones anteriores (730f093 / 46d3454)
  return `legacy:${String(p.model || '').toLowerCase()}|${String(p.name || '').toLowerCase()}`;
};

export const getBaseProducts = () => products.map(p => ({ ...p, baseId: `base:${String(p.cat || '')}|${String(p.name || '')}|${String(p.model || '')}` }));

export const getAllProducts = () => {
  const legacyRaw = localStorage.getItem('walkingpad_custom_products');
  let locals = loadArray('walkingpad_local_products');
  let changed = false;

  const baseProds = getBaseProducts();

  // 1. Migrar y normalizar productos locales (Asignar baseId si falta)
  locals = locals.map(localP => {
    if (localP.isOverride && !localP.baseId) {
      const oldLegacyId = `legacy:${String(localP.model || '').toLowerCase()}|${String(localP.name || '').toLowerCase()}`;
      const matches = baseProds.filter(bp => `legacy:${String(bp.model || '').toLowerCase()}|${String(bp.name || '').toLowerCase()}` === oldLegacyId);
      if (matches.length === 1) {
        changed = true;
        return { ...localP, baseId: matches[0].baseId };
      } else if (matches.length > 1) {
        changed = true;
        return { ...localP, migrationConflict: true };
      }
    }
    return localP;
  });

  // 2. Fusionar custom_products (Idempotente, detectando conflictos de contenido)
  if (legacyRaw != null) {
    const legacy = loadArray('walkingpad_custom_products');
    let hasConflicts = false;
    let conflictsArr = loadArray('walkingpad_migration_conflicts');

    for (const oldP of legacy) {
      let adapted = { ...oldP };
      if (!adapted.id && !adapted.baseId) {
        adapted.isOverride = true;
        const oldLegacyId = `legacy:${String(adapted.model || '').toLowerCase()}|${String(adapted.name || '').toLowerCase()}`;
        const matches = baseProds.filter(bp => `legacy:${String(bp.model || '').toLowerCase()}|${String(bp.name || '').toLowerCase()}` === oldLegacyId);
        if (matches.length === 1) {
          adapted.baseId = matches[0].baseId;
        } else if (matches.length > 1) {
          adapted.migrationConflict = true;
        }
      }

      const pid = getProductIdentity(adapted);
      const existingIndex = locals.findIndex(p => getProductIdentity(p) === pid);

      if (existingIndex < 0) {
        locals.unshift(adapted);
        changed = true;
      } else {
        if (JSON.stringify(locals[existingIndex]) !== JSON.stringify(adapted)) {
          // Evitar duplicar el mismo conflicto si se corre varias veces
          const alreadyConflicted = conflictsArr.some(c => JSON.stringify(c.incoming) === JSON.stringify(adapted));
          if (!alreadyConflicted) {
            conflictsArr.push({ existing: locals[existingIndex], incoming: adapted });
            hasConflicts = true;
          }
        }
      }
    }

    if (hasConflicts) {
      saveArray('walkingpad_migration_conflicts', conflictsArr);
    }
    
    // Solo borramos la llave antigua si podemos guardar y releer con éxito
    const saved = saveArray('walkingpad_local_products', locals);
    if (saved) {
      const verify = localStorage.getItem('walkingpad_local_products');
      if (verify === JSON.stringify(locals)) {
        localStorage.removeItem('walkingpad_custom_products');
      }
    }
  } else if (changed) {
    saveArray('walkingpad_local_products', locals);
  }

  const overrides = new Map(locals.filter(p => p.isOverride && !p.migrationConflict).map(p => [getProductIdentity(p), p]));
  const newCustoms = locals.filter(p => !p.isOverride);
  
  const combinedBase = baseProds.map(p => {
    const id = getProductIdentity(p);
    return overrides.has(id) ? { ...p, ...overrides.get(id), isOverride: true, originalProduct: p } : p;
  });
  
  // Agregar también los que tienen conflicto de migración como "Huerfanos" (para no perderlos)
  const conflicts = locals.filter(p => p.isOverride && p.migrationConflict);
  
  return [...newCustoms, ...conflicts, ...combinedBase];
};

export const getLocalProducts = () => loadArray('walkingpad_local_products');

export const saveLocalProduct = product => {
  const locals = loadArray('walkingpad_local_products');
  const baseProds = getBaseProducts();
  
  const pid = getProductIdentity(product);
  
  const existingIndex = locals.findIndex(p => getProductIdentity(p) === pid);
  
  if (existingIndex < 0 && baseProds.some(p => getProductIdentity(p) === pid)) {
    product.isOverride = true;
    locals.unshift(product);
  } else if (existingIndex >= 0) {
    product.isOverride = locals[existingIndex].isOverride;
    locals[existingIndex] = product;
  } else {
    product.isCustom = true;
    if (!product.id) {
       product.id = `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    locals.unshift(product);
  }

  return saveArray('walkingpad_local_products', locals);
};

export const deleteLocalProduct = pOrModel => {
  const pid = typeof pOrModel === 'string' ? pOrModel : getProductIdentity(pOrModel);
  const locals = loadArray('walkingpad_local_products');
  const filtered = locals.filter(p => getProductIdentity(p) !== pid);
  return saveArray('walkingpad_local_products', filtered);
};

export const overrideLocalProducts = (newLocals) => {
  return saveArray('walkingpad_local_products', newLocals);
};
