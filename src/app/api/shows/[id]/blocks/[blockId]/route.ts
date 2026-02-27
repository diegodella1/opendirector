import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shows/:id/blocks/:blockId
export async function GET(
  _request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  const { data, error } = await supabase
    .from('od_blocks')
    .select('*')
    .eq('id', params.blockId)
    .eq('show_id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PUT /api/shows/:id/blocks/:blockId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  const body = await request.json();

  const { data, error } = await supabase
    .from('od_blocks')
    .update(body)
    .eq('id', params.blockId)
    .eq('show_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'block_updated',
      payload: { blockId: params.blockId, changes: body },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/blocks/:blockId
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  const { error } = await supabase
    .from('od_blocks')
    .delete()
    .eq('id', params.blockId)
    .eq('show_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'block_deleted',
      payload: { blockId: params.blockId },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ deleted: true });
}
