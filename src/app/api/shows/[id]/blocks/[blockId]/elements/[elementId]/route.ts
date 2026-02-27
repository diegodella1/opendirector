import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT /api/shows/:id/blocks/:blockId/elements/:elementId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  const body = await request.json();

  const { data, error } = await supabase
    .from('od_elements')
    .update(body)
    .eq('id', params.elementId)
    .eq('block_id', params.blockId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Element not found' }, { status: 404 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'element_updated',
      payload: { elementId: params.elementId, changes: body },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/blocks/:blockId/elements/:elementId
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  const { error } = await supabase
    .from('od_elements')
    .delete()
    .eq('id', params.elementId)
    .eq('block_id', params.blockId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'element_deleted',
      payload: { elementId: params.elementId, blockId: params.blockId },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ deleted: true });
}
