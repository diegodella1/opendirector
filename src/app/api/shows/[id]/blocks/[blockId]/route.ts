import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { filterLiveEdits } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';

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
  let body = await request.json();

  // Check if show is live — restrict editable fields
  const { data: show } = await supabase
    .from('od_shows')
    .select('status')
    .eq('id', params.id)
    .single();

  if (show?.status === 'live') {
    const { filtered, blocked } = filterLiveEdits('block', body);
    if (Object.keys(filtered).length === 0) {
      return NextResponse.json(
        { error: `Cannot edit ${blocked.join(', ')} while show is live` },
        { status: 403 }
      );
    }
    body = filtered;
  }

  // Fetch old values for undo
  const { data: oldBlock } = await supabase
    .from('od_blocks')
    .select('*')
    .eq('id', params.blockId)
    .single();

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

  // Record undo entry
  if (oldBlock) {
    const oldChanges: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      oldChanges[key] = oldBlock[key as keyof typeof oldBlock];
    }
    await recordUndoEntry(
      params.id,
      'update_block',
      { blockId: params.blockId, changes: body },
      { blockId: params.blockId, changes: oldChanges }
    );
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
  // Snapshot for undo (block + elements + actions)
  const { data: blockSnap } = await supabase.from('od_blocks').select('*').eq('id', params.blockId).single();
  const { data: elemSnap } = await supabase.from('od_elements').select('*').eq('block_id', params.blockId);
  const elementIds = (elemSnap || []).map((e: { id: string }) => e.id);
  let actSnap: Record<string, unknown>[] = [];
  if (elementIds.length > 0) {
    const { data } = await supabase.from('od_actions').select('*').in('element_id', elementIds);
    actSnap = data || [];
  }

  const { error } = await supabase
    .from('od_blocks')
    .delete()
    .eq('id', params.blockId)
    .eq('show_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record undo entry
  if (blockSnap) {
    await recordUndoEntry(
      params.id,
      'delete_block',
      { blockId: params.blockId },
      { block: blockSnap, elements: elemSnap || [], actions: actSnap }
    );
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
