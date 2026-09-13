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
export const getBaseProducts = () => products;
export const getIssues = key => [...new Map((key || '').split(',').flatMap(k => issues[k.trim()] || []).map(i => [i.id, i])).values()];

export const getProductIdentity = p => p.id ? `id:${p.id}` : `base:${String(p.model || '').toLowerCase()}|${String(p.name || '').toLowerCase()}`;

export const getAllProducts = () => {
  // Migración silenciosa si existen custom products antiguos
  const legacy = loadArray('walkingpad_custom_products');
  if (legacy.length > 0) {
    if (saveArray('walkingpad_local_products', [...legacy, ...loadArray('walkingpad_local_products')])) {
      localStorage.removeItem('walkingpad_custom_products');
    }
  }

  const localProducts = loadArray('walkingpad_local_products');
  const overrides = new Map(localProducts.filter(p => p.isOverride).map(p => [getProductIdentity(p), p]));
  const newCustoms = localProducts.filter(p => !p.isOverride);
  
  const combinedBase = products.map(p => {
    const id = getProductIdentity(p);
    return overrides.has(id) ? { ...p, ...overrides.get(id), isOverride: true, originalProduct: p } : p;
  });
  
  return [...newCustoms, ...combinedBase];
};

export const getLocalProducts = () => loadArray('walkingpad_local_products');

export const saveLocalProduct = product => {
  const locals = loadArray('walkingpad_local_products');
  
  const pid = getProductIdentity(product);
  
  // Update if exists, or append if new.
  const existingIndex = locals.findIndex(p => getProductIdentity(p) === pid);
  
  // Comprobar si está intentando sobrescribir un modelo base que no había sido sobrescrito antes
  if (existingIndex < 0 && products.some(p => getProductIdentity(p) === pid)) {
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
