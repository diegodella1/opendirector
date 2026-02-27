import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { recordUndoEntry } from '@/lib/undo';

// GET /api/shows/:id/blocks/:blockId/elements
export async function GET(
  _request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  const { data, error } = await supabase
    .from('od_elements')
    .select('*')
    .eq('block_id', params.blockId)
    .order('position');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows/:id/blocks/:blockId/elements
export async function POST(
  request: Request,
  { params }: { params: { id: string; blockId: string } }
) {
  const body = await request.json();

  if (!body.type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  // Get next position
  const { data: lastElement } = await supabase
    .from('od_elements')
    .select('position')
    .eq('block_id', params.blockId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = lastElement ? lastElement.position + 1 : 0;

  const { data, error } = await supabase
    .from('od_elements')
    .insert({
      block_id: params.blockId,
      type: body.type,
      position,
      title: body.title || null,
      subtitle: body.subtitle || null,
      duration_sec: body.duration_sec || null,
      style: body.style || 'standard',
      mode: body.mode || 'fullscreen',
      trigger_type: body.trigger_type || 'manual',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record undo entry
  await recordUndoEntry(
    params.id,
    'create_element',
    { element: data },
    { elementId: data.id }
  );

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'element_created',
      payload: { element: data },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data, { status: 201 });
}
