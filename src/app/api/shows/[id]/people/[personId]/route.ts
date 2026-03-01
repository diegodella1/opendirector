import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shows/:id/people/:personId
export async function GET(
  _request: Request,
  { params }: { params: { id: string; personId: string } }
) {
  const { data, error } = await supabase
    .from('od_people')
    .select('*')
    .eq('id', params.personId)
    .eq('show_id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PUT /api/shows/:id/people/:personId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; personId: string } }
) {
  const body = await request.json();

  const { data, error } = await supabase
    .from('od_people')
    .update(body)
    .eq('id', params.personId)
    .eq('show_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/people/:personId
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; personId: string } }
) {
  const { error } = await supabase
    .from('od_people')
    .delete()
    .eq('id', params.personId)
    .eq('show_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
