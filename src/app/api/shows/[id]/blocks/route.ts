import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';

// GET /api/shows/:id/blocks
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_blocks')
    .select('*')
    .eq('show_id', params.id)
    .order('position');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows/:id/blocks
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Block creation while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'create blocks');
  if (rejected) return rejected;

  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Get next position
  const { data: lastBlock } = await supabase
    .from('od_blocks')
    .select('position')
    .eq('show_id', params.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = lastBlock ? lastBlock.position + 1 : 0;

  const { data, error } = await supabase
    .from('od_blocks')
    .insert({
      show_id: params.id,
      name,
      position,
      estimated_duration_sec: body.estimated_duration_sec || 0,
      script: body.script || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment show version
  const { data: show } = await supabase
    .from('od_shows')
    .select('version')
    .eq('id', params.id)
    .single();

  if (show) {
    await supabase
      .from('od_shows')
      .update({
        version: show.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  }

  // Record undo entry
  await recordUndoEntry(
    params.id,
    'create_block',
    { block: data },
    { blockId: data.id }
  );

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'block_created',
      payload: { block: data },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data, { status: 201 });
}
