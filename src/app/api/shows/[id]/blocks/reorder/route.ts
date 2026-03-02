import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';
export const dynamic = 'force-dynamic';

// PUT /api/shows/:id/blocks/reorder — reorder blocks by ID array
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Block reorder while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'reorder blocks');
  if (rejected) return rejected;

  const body = await request.json();
  const order: string[] = body.order;

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order array is required' }, { status: 400 });
  }

  // Validate all IDs belong to this show
  const { data: blocks, error: fetchError } = await supabase
    .from('od_blocks')
    .select('id')
    .eq('show_id', params.id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const blockIds = new Set((blocks || []).map((b: { id: string }) => b.id));
  const invalid = order.filter((id) => !blockIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `IDs not in this show: ${invalid.join(', ')}` },
      { status: 400 }
    );
  }

  // Save old order for undo
  const { data: oldBlocks } = await supabase
    .from('od_blocks')
    .select('id')
    .eq('show_id', params.id)
    .order('position');
  const oldOrder = (oldBlocks || []).map((b: { id: string }) => b.id);

  // Update positions
  await Promise.all(
    order.map((id, idx) =>
      supabase.from('od_blocks').update({ position: idx }).eq('id', id)
    )
  );

  // Record undo entry
  await recordUndoEntry(
    params.id,
    'reorder_blocks',
    { order },
    { order: oldOrder }
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
      type: 'blocks_reordered',
      payload: { order },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, order });
}
