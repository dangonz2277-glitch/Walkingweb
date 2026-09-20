import { toDatabase, fromDatabase } from '../domain/catalogCustomProduct.js';

export class CatalogRepositoryError extends Error {
  constructor(cause) {
    super('Ha ocurrido un error interno en el repositorio del catálogo.', { cause });
    this.name = 'CatalogRepositoryError';
    this.code = 'CATALOG_DB_ERROR';
  }
}

function handleDbError(error) {
  throw new CatalogRepositoryError(error);
}

export async function listActiveCustomProducts(supabase) {
  const { data, error } = await supabase
    .from('catalog_custom_products')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) handleDbError(error);
  return data.map(fromDatabase);
}

export async function getCustomProductById(supabase, id) {
  const { data, error } = await supabase
    .from('catalog_custom_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) handleDbError(error);
  if (!data) return { status: 'NOT_FOUND' };
  if (data.deleted_at) return { status: 'DELETED' };
  return { status: 'OK', data: fromDatabase(data) };
}

function isIdenticalCustomProduct(existing, row) {
  if (existing.cat !== row.cat) return false;
  if (existing.name !== row.name) return false;
  if (existing.model !== row.model) return false;
  if (existing.capacity !== row.capacity) return false;
  if (existing.speed !== row.speed) return false;
  if (existing.motor !== row.motor) return false;
  if (existing.area !== row.area) return false;
  if (existing.weight !== row.weight) return false;
  if (existing.folded !== row.folded) return false;
  if (existing.control !== row.control) return false;
  if (existing.assembly !== row.assembly) return false;
  if (existing.notes !== row.notes) return false;

  const orderLinks = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(l => ({ label: l.label || '', url: l.url || '', price: l.price || '' }));
  };

  const orderIssues = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(i => ({ code: i.code || '', name: i.name || '', fix: i.fix || '', parts: i.parts || '' }));
  };

  const existingLinksJson = JSON.stringify(orderLinks(existing.links));
  const rowLinksJson = JSON.stringify(orderLinks(row.links));
  if (existingLinksJson !== rowLinksJson) return false;

  const existingIssuesJson = JSON.stringify(orderIssues(existing.issues));
  const rowIssuesJson = JSON.stringify(orderIssues(row.issues));
  if (existingIssuesJson !== rowIssuesJson) return false;

  return true;
}

export async function createCustomProduct(supabase, product, requestId) {
  const row = toDatabase(product, requestId);
  const { data, error } = await supabase
    .from('catalog_custom_products')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: errExist } = await supabase
        .from('catalog_custom_products')
        .select('*')
        .eq('request_id', requestId)
        .maybeSingle();

      if (errExist) handleDbError(errExist);
      if (!existing) handleDbError(new Error('Conflicto único pero registro no encontrado'));
      if (existing.deleted_at) return { status: 'DELETED' };
      
      if (isIdenticalCustomProduct(existing, row)) {
        return { status: 'IDEMPOTENT_REPLAY', data: fromDatabase(existing) };
      } else {
        return { status: 'CONFLICT', error: 'El request_id ya existe con contenido distinto' };
      }
    }
    handleDbError(error);
  }

  return { status: 'CREATED', data: fromDatabase(data) };
}

export async function updateCustomProduct(supabase, id, expectedRevision, product) {
  const row = toDatabase(product);
  row.revision = expectedRevision + 1;

  const { data, error } = await supabase
    .from('catalog_custom_products')
    .update(row)
    .eq('id', id)
    .eq('revision', expectedRevision)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) handleDbError(error);

  if (data) {
    return { status: 'OK', data: fromDatabase(data) };
  }

  const { data: current, error: checkError } = await supabase
    .from('catalog_custom_products')
    .select('revision, deleted_at')
    .eq('id', id)
    .maybeSingle();

  if (checkError) handleDbError(checkError);
  if (!current) return { status: 'NOT_FOUND' };
  if (current.deleted_at) return { status: 'DELETED' };
  
  return { status: 'CONFLICT', currentRevision: current.revision };
}

export async function softDeleteCustomProduct(supabase, id, expectedRevision) {
  const { data, error } = await supabase
    .from('catalog_custom_products')
    .update({ deleted_at: new Date().toISOString(), revision: expectedRevision + 1 })
    .eq('id', id)
    .eq('revision', expectedRevision)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) handleDbError(error);

  if (data) {
    return { status: 'OK' };
  }

  const { data: current, error: checkError } = await supabase
    .from('catalog_custom_products')
    .select('revision, deleted_at')
    .eq('id', id)
    .maybeSingle();

  if (checkError) handleDbError(checkError);
  if (!current) return { status: 'NOT_FOUND' };
  if (current.deleted_at) return { status: 'DELETED' };
  
  return { status: 'CONFLICT', currentRevision: current.revision };
}
