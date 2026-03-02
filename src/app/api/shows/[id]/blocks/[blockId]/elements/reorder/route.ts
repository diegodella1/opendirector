import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';
export const dynamic = 'force-dynamic';

// PUT /api/shows/:id/blocks/:blockId/elements/reorder — reorder elements by ID array
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  // Block element reorder while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'reorder elements');
  if (rejected) return rejected;

  const body = await request.json();
  const order: string[] = body.order;

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order array is required' }, { status: 400 });
  }

  // Validate all IDs belong to this block
  const { data: elements, error: fetchError } = await supabase
    .from('od_elements')
    .select('id')
    .eq('block_id', params.blockId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const elementIds = new Set((elements || []).map((e: { id: string }) => e.id));
  const invalid = order.filter((id) => !elementIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `IDs not in this block: ${invalid.join(', ')}` },
      { status: 400 }
    );
  }

  // Save old order for undo
  const { data: oldElements } = await supabase
    .from('od_elements')
    .select('id')
    .eq('block_id', params.blockId)
    .order('position');
  const oldOrder = (oldElements || []).map((e: { id: string }) => e.id);

  // Update positions
  await Promise.all(
    order.map((id, idx) =>
      supabase.from('od_elements').update({ position: idx }).eq('id', id)
    )
  );

  // Record undo entry
  await recordUndoEntry(
    params.id,
    'reorder_elements',
    { blockId: params.blockId, order },
    { blockId: params.blockId, order: oldOrder }
  );

  // Increment show version
  const { data: show } = await supabase
    .from('od_shows')
    .select('version')
    .eq('id', params.id)
    .single();

  if (show) {
    await supabase
      .from('od_shows')
      .update({ version: show.version + 1, updated_at: new Date().toISOString() })
      .eq('id', params.id);
  }

  // Broadcast
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'elements_reordered',
      payload: { blockId: params.blockId, order },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, order });
}
