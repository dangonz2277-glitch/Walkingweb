import { NextResponse } from 'next/server';
import { requireAuthSession, validateMutationRequest, compareSitePassword } from '../../../../../src/backend/routeSecurity.js';
import { getCatalogAdminClient } from '../../../../../src/backend/catalogSupabaseAdmin.js';
import { updateCustomProduct, softDeleteCustomProduct } from '../../../../../src/backend/catalogCustomProductRepository.js';
import { validateUpdateCustomProductPayload } from '../../../../../src/domain/catalogCustomProduct.js';

function isValidUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function PATCH(req, context) {
  const auth = await requireAuthSession(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  const mutCheck = await validateMutationRequest(req);
  if (mutCheck.error) {
    return NextResponse.json({ error: mutCheck.error }, { status: mutCheck.status });
  }

  const val = validateUpdateCustomProductPayload(mutCheck.json);
  if (!val.valid) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: val }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getCatalogAdminClient();
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  try {
    const res = await updateCustomProduct(supabase, id, val.expectedRevision, val.data);
    if (res.status === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (res.status === 'DELETED') {
      return NextResponse.json({ error: 'DELETED' }, { status: 410 });
    }
    if (res.status === 'CONFLICT') {
      return NextResponse.json({ error: 'CONFLICT', currentRevision: res.currentRevision }, { status: 409 });
    }
    
    return NextResponse.json({ product: res.data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req, context) {
  const auth = await requireAuthSession(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  const mutCheck = await validateMutationRequest(req);
  if (mutCheck.error) {
    return NextResponse.json({ error: mutCheck.error }, { status: mutCheck.status });
  }

  const payload = mutCheck.json;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 });
  }

  const allowed = new Set(['expectedRevision', 'password']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      return NextResponse.json({ error: 'UNKNOWN_FIELD', field: key }, { status: 400 });
    }
  }

  if (typeof payload.expectedRevision !== 'number' || !Number.isInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', field: 'expectedRevision' }, { status: 400 });
  }

  if (typeof payload.password !== 'string' || payload.password === '') {
    return NextResponse.json({ error: 'VALIDATION_ERROR', field: 'password' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getCatalogAdminClient();
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const ident = auth.identHash;
  try {
    const { data: allowedAttempt, error: rlError } = await supabase.rpc('check_catalog_delete_rate_limit', {
      client_ident: ident,
      max_attempts: 5,
      window_interval: '1 minute'
    });

    if (rlError) throw rlError;
    if (allowedAttempt !== true) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  let isMatch = false;
  try {
    isMatch = compareSitePassword(payload.password);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  if (!isMatch) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { error: resetError } = await supabase.rpc('reset_catalog_delete_rate_limit', { client_ident: ident });
    if (resetError) throw resetError;
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  try {
    const res = await softDeleteCustomProduct(supabase, id, payload.expectedRevision);
    if (res.status === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (res.status === 'DELETED') {
      return NextResponse.json({ error: 'DELETED' }, { status: 410 });
    }
    if (res.status === 'CONFLICT') {
      return NextResponse.json({ error: 'CONFLICT', currentRevision: res.currentRevision }, { status: 409 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
