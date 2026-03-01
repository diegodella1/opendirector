import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';

// PUT /api/shows/:id/blocks/:blockId/elements/:elementId/actions/:actionId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string; actionId: string } }
) {
  // Actions completely locked while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'update actions');
  if (rejected) return rejected;

  const body = await request.json();

  // Snapshot old values for undo
  const { data: oldAction } = await supabase
    .from('od_actions')
    .select('*')
    .eq('id', params.actionId)
    .eq('element_id', params.elementId)
    .single();

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

  // Record undo: forward = new values, reverse = old values
  if (oldAction) {
    const oldChanges: Record<string, unknown> = {};
    const newChanges: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      oldChanges[key] = oldAction[key];
      newChanges[key] = body[key];
    }
    await recordUndoEntry(
      params.id,
      'update_action',
      { actionId: params.actionId, changes: newChanges },
      { actionId: params.actionId, changes: oldChanges }
    );
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
  // Actions completely locked while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'delete actions');
  if (rejected) return rejected;

  // Snapshot before delete for undo
  const { data: snapshot } = await supabase
    .from('od_actions')
    .select('*')
    .eq('id', params.actionId)
    .eq('element_id', params.elementId)
    .single();

  const { error } = await supabase
    .from('od_actions')
    .delete()
    .eq('id', params.actionId)
    .eq('element_id', params.elementId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record undo: forward = { actionId }, reverse = full snapshot
  if (snapshot) {
    await recordUndoEntry(
      params.id,
      'delete_action',
      { actionId: params.actionId },
      { action: snapshot }
    );
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
