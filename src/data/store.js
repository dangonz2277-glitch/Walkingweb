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

export const getAllProducts = () => {
  // Migración silenciosa si existen custom products antiguos
  const legacy = loadArray('walkingpad_custom_products');
  if (legacy.length > 0) {
    saveArray('walkingpad_local_products', [...legacy, ...loadArray('walkingpad_local_products')]);
    localStorage.removeItem('walkingpad_custom_products');
  }

  const localProducts = loadArray('walkingpad_local_products');
  const overrides = new Map(localProducts.filter(p => p.isOverride).map(p => [p.model, p]));
  const newCustoms = localProducts.filter(p => !p.isOverride);
  
  const combinedBase = products.map(p => overrides.has(p.model) ? { ...p, ...overrides.get(p.model), isOverride: true, originalProduct: p } : p);
  
  return [...newCustoms, ...combinedBase];
};

export const getLocalProducts = () => loadArray('walkingpad_local_products');

export const saveLocalProduct = product => {
  const locals = loadArray('walkingpad_local_products');
  
  if (!product.model) return false;
  
  // Update if exists, or append if new.
  // Identity is product.model
  const existingIndex = locals.findIndex(p => p.model === product.model);
  
  // Comprobar si está intentando sobrescribir un modelo base que no había sido sobrescrito antes
  if (existingIndex < 0 && products.some(p => p.model === product.model)) {
    product.isOverride = true;
    locals.unshift(product);
  } else if (existingIndex >= 0) {
    product.isOverride = locals[existingIndex].isOverride;
    locals[existingIndex] = product;
  } else {
    product.isCustom = true;
    locals.unshift(product);
  }

  return saveArray('walkingpad_local_products', locals);
};

export const deleteLocalProduct = model => {
  const locals = loadArray('walkingpad_local_products');
  const filtered = locals.filter(p => p.model !== model);
  return saveArray('walkingpad_local_products', filtered);
};

export const overrideLocalProducts = (newLocals) => {
  return saveArray('walkingpad_local_products', newLocals);
};
