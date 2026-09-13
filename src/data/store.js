import categories from '../catalog-data/categories.json';
import products from '../catalog-data/products.json';
import sourceIssues from '../catalog-data/issues_complete.json';
import guide from '../catalog-data/guia.json';
import generalIssues from '../catalog-data/general_issues.json';
import { buildIssues } from './issues.js';
import { loadArray, saveArray } from './storage.js';

const issues = buildIssues(sourceIssues);
export const getCategories = () => categories;
export const getGuide = () => guide;
export const getGeneralIssues = () => generalIssues;
export const getBaseProducts = () => products;
export const getIssues = key => [...new Map((key || '').split(',').flatMap(k => issues[k.trim()] || []).map(i => [i.id, i])).values()];
export const getAllProducts = () => [...loadArray('walkingpad_custom_products'), ...products];
export const addProduct = product => saveArray('walkingpad_custom_products', [product, ...loadArray('walkingpad_custom_products')]);
