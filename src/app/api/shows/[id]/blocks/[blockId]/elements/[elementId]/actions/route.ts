import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rejectIfLive } from '@/lib/state-machine';
import { recordUndoEntry } from '@/lib/undo';

// GET /api/shows/:id/blocks/:blockId/elements/:elementId/actions
export async function GET(
  _request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  const { data, error } = await supabase
    .from('od_actions')
    .select('*')
    .eq('element_id', params.elementId)
    .order('position');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows/:id/blocks/:blockId/elements/:elementId/actions
export async function POST(
  request: Request,
  { params }: { params: { id: string; blockId: string; elementId: string } }
) {
  // Actions completely locked while live
  const { data: showCheck } = await supabase.from('od_shows').select('status').eq('id', params.id).single();
  const rejected = rejectIfLive(showCheck?.status || 'draft', 'create actions');
  if (rejected) return rejected;

  const body = await request.json();

  if (!body.phase || !body.vmix_function) {
    return NextResponse.json(
      { error: 'phase and vmix_function are required' },
      { status: 400 }
    );
  }

  // Get next position
  const { data: lastAction } = await supabase
    .from('od_actions')
    .select('position')
    .eq('element_id', params.elementId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = lastAction ? lastAction.position + 1 : 0;

  const { data, error } = await supabase
    .from('od_actions')
    .insert({
      element_id: params.elementId,
      phase: body.phase,
      step_label: body.step_label || null,
      step_color: body.step_color || null,
      step_hotkey: body.step_hotkey || null,
      position,
      vmix_function: body.vmix_function,
      target: body.target || null,
      field: body.field || null,
      value: body.value || null,
      delay_ms: body.delay_ms || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Record undo entry
  await recordUndoEntry(params.id, 'create_action', { action: data }, { actionId: data.id });

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'action_created',
      payload: { action: data },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data, { status: 201 });
}
