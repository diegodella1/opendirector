import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shows/:id
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_shows')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PUT /api/shows/:id (with optimistic locking)
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { expectedVersion, ...updates } = body;

  if (expectedVersion === undefined) {
    return NextResponse.json(
      { error: 'expectedVersion is required' },
      { status: 400 }
    );
  }

  // Check current version
  const { data: current, error: fetchError } = await supabase
    .from('od_shows')
    .select('version')
    .eq('id', params.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  if (current.version !== expectedVersion) {
    return NextResponse.json(
      { error: 'Version conflict', currentVersion: current.version },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('od_shows')
    .update({
      ...updates,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('version', expectedVersion)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Version conflict (concurrent update)' },
      { status: 409 }
    );
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await supabase
    .from('od_shows')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
