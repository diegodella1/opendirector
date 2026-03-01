import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';

// PUT /api/shows/:id/blocks/:blockId/elements/:elementId/actions/reorder
export async function PUT(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'reorder actions');
  if (rejected) return rejected;

  const body = await request.json();
  const order: string[] = body.order;

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order array is required' }, { status: 400 });
  }

  // Validate all IDs belong to this element
  const { data: actions, error: fetchError } = await supabase
    .from('od_actions')
    .select('id')
    .eq('element_id', params.elementId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const actionIds = new Set((actions || []).map((a: { id: string }) => a.id));
  const invalid = order.filter((id) => !actionIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `IDs not in this element: ${invalid.join(', ')}` },
      { status: 400 }
    );
  }

  // Update positions
  await Promise.all(
    order.map((id, idx) =>
      supabase.from('od_actions').update({ position: idx }).eq('id', id)
    )
  );

  // Broadcast
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'actions_reordered',
      payload: { elementId: params.elementId, order },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, order });
}
