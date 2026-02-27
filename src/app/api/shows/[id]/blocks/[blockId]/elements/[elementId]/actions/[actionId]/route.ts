import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT /api/shows/:id/blocks/:blockId/elements/:elementId/actions/:actionId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string; actionId: string } }
) {
  const body = await request.json();

  const { data, error } = await supabase
    .from('od_actions')
    .update(body)
    .eq('id', params.actionId)
    .eq('element_id', params.elementId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }

  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'action_updated',
      payload: { actionId: params.actionId, changes: body },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/blocks/:blockId/elements/:elementId/actions/:actionId
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string; actionId: string } }
) {
  const { error } = await supabase
    .from('od_actions')
    .delete()
    .eq('id', params.actionId)
    .eq('element_id', params.elementId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'action_deleted',
      payload: { actionId: params.actionId, elementId: params.elementId },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ deleted: true });
}
