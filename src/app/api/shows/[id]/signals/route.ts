import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/shows/:id/signals — create a signal
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  if (!body.type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  // Calculate expiration based on type
  let expiresAt: string | null = null;
  if (body.type === 'countdown' && body.value) {
    const seconds = parseInt(body.value, 10);
    if (!isNaN(seconds)) {
      expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
    }
  } else if (body.type === 'go') {
    expiresAt = new Date(Date.now() + 3000).toISOString();
  }

  const { data, error } = await supabase
    .from('od_signals')
    .insert({
      show_id: params.id,
      type: body.type,
      value: body.value || null,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast to signals channel
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'signals',
      type: 'signal',
      payload: data,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data, { status: 201 });
}

// GET /api/shows/:id/signals — list active signals
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_signals')
    .select('*')
    .eq('show_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/signals — clear all signals
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await supabase
    .from('od_signals')
    .delete()
    .eq('show_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast clear
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'signals',
      type: 'signals_cleared',
      payload: {},
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ cleared: true });
}
