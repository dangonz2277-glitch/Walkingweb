export class CatalogApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CatalogApiError';
    this.status = details.status;
    this.code = details.code;
    this.field = details.field;
    this.currentRevision = details.currentRevision;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidRemoteProduct(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (typeof p.id !== 'string' || !UUID_REGEX.test(p.id)) return false;
  if (typeof p.revision !== 'number' || !Number.isInteger(p.revision) || p.revision < 0) return false;
  if (typeof p.name !== 'string') return false;
  if (typeof p.model !== 'string') return false;
  if (typeof p.cat !== 'string') return false;
  if (typeof p.capacity !== 'string') return false;
  if (!Array.isArray(p.links)) return false;
  if (!Array.isArray(p.issues)) return false;
  return true;
}

async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    throw new CatalogApiError('NETWORK_ERROR');
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data = null;
  if (isJson) {
    try {
      data = await response.json();
    } catch {
      throw new CatalogApiError('INVALID_JSON_RESPONSE', { status: response.status });
    }
  } else if (!response.ok) {
    throw new CatalogApiError('UNEXPECTED_RESPONSE_TYPE', { status: response.status });
  } else {
    throw new CatalogApiError('INVALID_JSON_RESPONSE', { status: response.status });
  }

  if (!response.ok) {
    throw new CatalogApiError(data?.error || data?.message || 'API_ERROR', {
      status: response.status,
      code: data?.code ?? data?.details?.code,
      field: data?.field ?? data?.details?.field,
      currentRevision: data?.currentRevision
    });
  }

  return data;
}

export async function listCustomProducts({ signal } = {}) {
  const data = await fetchJson('/api/catalog/custom-products', { method: 'GET', signal });
  if (!data || !Array.isArray(data.products) || !data.products.every(isValidRemoteProduct)) {
    throw new CatalogApiError('INVALID_RESPONSE_STRUCTURE', { status: 200 });
  }
  return data.products;
}

export async function createCustomProduct(product, requestId, { signal } = {}) {
  const data = await fetchJson('/api/catalog/custom-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, productData: product }),
    signal
  });
  if (!data || !isValidRemoteProduct(data.product)) {
    throw new CatalogApiError('INVALID_RESPONSE_STRUCTURE', { status: 201 });
  }
  return data.product;
}

export async function updateCustomProduct(id, product, expectedRevision, { signal } = {}) {
  const data = await fetchJson(`/api/catalog/custom-products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, productData: product }),
    signal
  });
  if (!data || !isValidRemoteProduct(data.product)) {
    throw new CatalogApiError('INVALID_RESPONSE_STRUCTURE', { status: 200 });
  }
  return data.product;
}

export async function deleteCustomProduct(id, expectedRevision, password, { signal } = {}) {
  await fetchJson(`/api/catalog/custom-products/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, password }),
    signal
  });
}
