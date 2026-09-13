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
export const getAllProducts = () => [...loadArray('walkingpad_custom_products'), ...products];
export const addProduct = product => saveArray('walkingpad_custom_products', [product, ...loadArray('walkingpad_custom_products')]);
