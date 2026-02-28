import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { filterLiveEdits, rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';

// PUT /api/shows/:id/blocks/:blockId/elements/:elementId
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  let body = await request.json();

  // Check if show is live — restrict editable fields
  const { data: show } = await supabase
    .from('od_shows')
    .select('status')
    .eq('id', params.id)
    .single();

  if (show?.status === 'live') {
    const { filtered, blocked } = filterLiveEdits('element', body);
    if (Object.keys(filtered).length === 0) {
      return NextResponse.json(
        { error: `Cannot edit ${blocked.join(', ')} while show is live` },
        { status: 403 }
      );
    }
    body = filtered;
  }

  // Fetch old values for undo
  const { data: oldEl } = await supabase
    .from('od_elements')
    .select('*')
    .eq('id', params.elementId)
    .single();

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

  // Record undo entry
  if (oldEl) {
    const oldChanges: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      oldChanges[key] = oldEl[key as keyof typeof oldEl];
    }
    await recordUndoEntry(
      params.id,
      'update_element',
      { elementId: params.elementId, changes: body },
      { elementId: params.elementId, changes: oldChanges }
    );
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
  // Block element deletion while live
  const { data: showForDelete } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showForDelete?.status || 'draft', 'delete elements');
  if (rejected) return rejected;

  // Snapshot for undo
  const { data: elSnap } = await supabase.from('od_elements').select('*').eq('id', params.elementId).single();
  const { data: actSnap } = await supabase.from('od_actions').select('*').eq('element_id', params.elementId);

  const { error } = await supabase
    .from('od_elements')
    .delete()
    .eq('id', params.elementId)
    .eq('block_id', params.blockId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record undo entry
  if (elSnap) {
    await recordUndoEntry(
      params.id,
      'delete_element',
      { elementId: params.elementId },
      { element: elSnap, actions: actSnap || [] }
    );
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
