import { NextResponse } from 'next/server';
import { requireAuthSession, validateMutationRequest } from '../../../../src/backend/routeSecurity.js';
import { getCatalogAdminClient } from '../../../../src/backend/catalogSupabaseAdmin.js';
import { listActiveCustomProducts, createCustomProduct } from '../../../../src/backend/catalogCustomProductRepository.js';
import { validateCreateCustomProductPayload } from '../../../../src/domain/catalogCustomProduct.js';

export async function GET(req) {
  const auth = await requireAuthSession(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getCatalogAdminClient();
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  try {
    const products = await listActiveCustomProducts(supabase);
    return NextResponse.json({ products }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireAuthSession(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mutCheck = await validateMutationRequest(req);
  if (mutCheck.error) {
    return NextResponse.json({ error: mutCheck.error }, { status: mutCheck.status });
  }

  const payload = mutCheck.json;
  const val = validateCreateCustomProductPayload(payload);
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
    const res = await createCustomProduct(supabase, val.data, val.requestId);
    if (res.status === 'DELETED') {
      return NextResponse.json({ error: 'DELETED' }, { status: 410 });
    }
    if (res.status === 'CONFLICT') {
      return NextResponse.json({ error: 'CONFLICT' }, { status: 409 });
    }
    
    const code = res.status === 'CREATED' ? 201 : 200;
    return NextResponse.json({ product: res.data, status: res.status }, { status: code });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
