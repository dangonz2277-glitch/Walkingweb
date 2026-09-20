function isPlainObject(val) {
  return Object.prototype.toString.call(val) === '[object Object]';
}

export function validateCreateCustomProductPayload(payload) {
  if (!isPlainObject(payload)) {
    return { valid: false, code: "INVALID_FORMAT", field: "root", error: "El payload debe ser un objeto plano" };
  }
  
  const allowed = new Set(['requestId', 'productData']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      return { valid: false, code: "UNKNOWN_FIELD", field: key, error: `Propiedad desconocida en payload: ${key}` };
    }
  }

  const reqRes = validateRequestId(payload.requestId);
  if (!reqRes.valid) return reqRes;
  
  if (!isPlainObject(payload.productData)) {
    return { valid: false, code: "INVALID_FORMAT", field: "productData", error: "productData debe ser un objeto plano" };
  }

  const dataRes = validateCustomProductData(payload.productData);
  if (!dataRes.valid) return dataRes;

  return { valid: true, requestId: reqRes.data, data: dataRes.data };
}

export function validateUpdateCustomProductPayload(payload) {
  if (!isPlainObject(payload)) {
    return { valid: false, code: "INVALID_FORMAT", field: "root", error: "El payload debe ser un objeto plano" };
  }
  
  const allowed = new Set(['expectedRevision', 'productData']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      return { valid: false, code: "UNKNOWN_FIELD", field: key, error: `Propiedad desconocida en payload: ${key}` };
    }
  }

  const revRes = validateExpectedRevision(payload.expectedRevision);
  if (!revRes.valid) return revRes;
  
  if (!isPlainObject(payload.productData)) {
    return { valid: false, code: "INVALID_FORMAT", field: "productData", error: "productData debe ser un objeto plano" };
  }

  const dataRes = validateCustomProductData(payload.productData);
  if (!dataRes.valid) return dataRes;

  return { valid: true, expectedRevision: revRes.data, data: dataRes.data };
}

export function validateCustomProductData(input) {
  if (!isPlainObject(input)) {
    return { valid: false, code: "INVALID_FORMAT", field: "root", error: "El productData debe ser un objeto plano" };
  }

  const allowedFields = new Set(['cat', 'name', 'model', 'capacity', 'speed', 'motor', 'area', 'weight', 'folded', 'control', 'assembly', 'notes', 'links', 'issues']);
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) {
      return { valid: false, code: "UNKNOWN_FIELD", field: key, error: `Propiedad desconocida: ${key}` };
    }
  }

  const getString = (key, maxLength, mandatory) => {
    let val = input[key];
    if (val === undefined || val === null) {
      if (mandatory) return { error: `Campo obligatorio ${key} ausente` };
      return { value: '' };
    }
    if (typeof val !== 'string') return { error: `El campo ${key} debe ser string` };
    val = val.trim();
    if (mandatory && val === '') return { error: `El campo ${key} no puede estar vacío` };
    if (val.length > maxLength) return { error: `El campo ${key} excede los ${maxLength} caracteres` };
    return { value: val };
  };

  const fields = [
    { key: 'cat', limit: 100, mandatory: true },
    { key: 'name', limit: 200, mandatory: true },
    { key: 'model', limit: 120, mandatory: true },
    { key: 'capacity', limit: 500, mandatory: true },
    { key: 'speed', limit: 500, mandatory: false },
    { key: 'motor', limit: 500, mandatory: false },
    { key: 'area', limit: 500, mandatory: false },
    { key: 'weight', limit: 500, mandatory: false },
    { key: 'folded', limit: 500, mandatory: false },
    { key: 'control', limit: 500, mandatory: false },
    { key: 'assembly', limit: 500, mandatory: false },
    { key: 'notes', limit: 5000, mandatory: false },
  ];

  const data = {};

  for (const field of fields) {
    const res = getString(field.key, field.limit, field.mandatory);
    if (res.error) return { valid: false, code: "VALIDATION_ERROR", field: field.key, error: res.error };
    data[field.key] = res.value;
  }

  const linksRes = validateLinks(input.links);
  if (!linksRes.valid) return linksRes;
  data.links = linksRes.data;

  const issuesRes = validateIssues(input.issues);
  if (!issuesRes.valid) return issuesRes;
  data.issues = issuesRes.data;

  return { valid: true, data };
}

export function validateLinks(links) {
  if (links === undefined || links === null) return { valid: true, data: [] };
  if (!Array.isArray(links)) return { valid: false, code: "VALIDATION_ERROR", field: "links", error: "links debe ser un arreglo" };

  const allowed = new Set(['label', 'url', 'price']);
  const normalized = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (!isPlainObject(link)) {
      return { valid: false, code: "VALIDATION_ERROR", field: `links[${i}]`, error: "Cada link debe ser un objeto plano" };
    }
    
    for (const key of Object.keys(link)) {
      if (!allowed.has(key)) return { valid: false, code: "UNKNOWN_FIELD", field: `links[${i}].${key}`, error: `Propiedad desconocida: ${key}` };
    }

    if (typeof link.url !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `links[${i}].url`, error: "url es obligatoria y debe ser string" };
    const url = link.url.trim();
    if (url === '' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return { valid: false, code: "VALIDATION_ERROR", field: `links[${i}].url`, error: "url debe comenzar con http:// o https://" };
    }

    let label = link.label !== undefined && link.label !== null ? link.label : '';
    if (typeof label !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `links[${i}].label`, error: "label debe ser string" };
    label = label.trim();
    if (label === '') label = 'Enlace';

    let price = link.price !== undefined && link.price !== null ? link.price : '';
    if (typeof price !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `links[${i}].price`, error: "price debe ser string" };
    price = price.trim();

    normalized.push({ label, url, price });
  }

  const encoder = new TextEncoder();
  if (encoder.encode(JSON.stringify(normalized)).length > 10000) {
    return { valid: false, code: "SIZE_EXCEEDED", field: "links", error: "El tamaño del arreglo links normalizado excede el límite permitido de bytes" };
  }

  return { valid: true, data: normalized };
}

export function validateIssues(issues) {
  if (issues === undefined || issues === null) return { valid: true, data: [] };
  if (!Array.isArray(issues)) return { valid: false, code: "VALIDATION_ERROR", field: "issues", error: "issues debe ser un arreglo" };

  const allowed = new Set(['code', 'name', 'fix', 'parts']);
  const normalized = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (!isPlainObject(issue)) {
      return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}]`, error: "Cada issue debe ser un objeto plano" };
    }
    
    for (const key of Object.keys(issue)) {
      if (!allowed.has(key)) return { valid: false, code: "UNKNOWN_FIELD", field: `issues[${i}].${key}`, error: `Propiedad desconocida: ${key}` };
    }

    if (typeof issue.code !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].code`, error: "code es obligatorio y debe ser string" };
    const code = issue.code.trim();
    if (code === '') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].code`, error: "code no puede estar vacío" };

    if (typeof issue.name !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].name`, error: "name es obligatorio y debe ser string" };
    const name = issue.name.trim();
    if (name === '') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].name`, error: "name no puede estar vacío" };

    let fix = issue.fix !== undefined && issue.fix !== null ? issue.fix : '';
    if (typeof fix !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].fix`, error: "fix debe ser string" };
    fix = fix.trim();

    let parts = issue.parts !== undefined && issue.parts !== null ? issue.parts : '';
    if (typeof parts !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}].parts`, error: "parts debe ser string" };
    parts = parts.trim();

    if (code.length > 50 || name.length > 200 || fix.length > 500 || parts.length > 500) {
      return { valid: false, code: "VALIDATION_ERROR", field: `issues[${i}]`, error: "Un campo dentro de issue excede su límite individual de caracteres" };
    }

    normalized.push({ code, name, fix, parts });
  }

  const encoder = new TextEncoder();
  if (encoder.encode(JSON.stringify(normalized)).length > 50000) {
    return { valid: false, code: "SIZE_EXCEEDED", field: "issues", error: "El tamaño del arreglo issues normalizado excede el límite permitido de bytes" };
  }

  return { valid: true, data: normalized };
}

export function validateRequestId(requestId) {
  if (typeof requestId !== 'string') return { valid: false, code: "VALIDATION_ERROR", field: "requestId", error: "requestId debe ser string" };
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(requestId)) return { valid: false, code: "VALIDATION_ERROR", field: "requestId", error: "requestId debe ser un UUID válido" };
  return { valid: true, data: requestId };
}

export function validateExpectedRevision(rev) {
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0) {
    return { valid: false, code: "VALIDATION_ERROR", field: "expectedRevision", error: "expectedRevision debe ser un número entero mayor o igual a 0" };
  }
  return { valid: true, data: rev };
}

export function toDatabase(product, requestId = null) {
  const row = {
    cat: product.cat,
    name: product.name,
    model: product.model,
    capacity: product.capacity,
    speed: product.speed,
    motor: product.motor,
    area: product.area,
    weight: product.weight,
    folded: product.folded,
    control: product.control,
    assembly: product.assembly,
    notes: product.notes,
    links: product.links,
    issues: product.issues
  };
  if (requestId) {
    row.request_id = requestId;
  }
  return row;
}

export function fromDatabase(row) {
  if (!row || typeof row !== 'object' || !row.id || typeof row.id !== 'string') {
    throw new Error('CATALOG_MAPPING_ERROR');
  }

  const links = row.links || [];
  const issues = row.issues || [];

  if (!Array.isArray(links)) throw new Error('CATALOG_MAPPING_ERROR');
  if (!Array.isArray(issues)) throw new Error('CATALOG_MAPPING_ERROR');

  return {
    id: row.id,
    requestId: row.request_id,
    cat: row.cat,
    name: row.name,
    model: row.model,
    capacity: row.capacity,
    speed: row.speed,
    motor: row.motor,
    area: row.area,
    weight: row.weight,
    folded: row.folded,
    control: row.control,
    assembly: row.assembly,
    notes: row.notes,
    links,
    issues,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isCustom: true,
    isRemoteCustom: true
  };
}
