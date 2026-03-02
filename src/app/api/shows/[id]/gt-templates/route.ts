import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

// GET /api/shows/:id/gt-templates — list GT templates
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_gt_templates')
    .select('*')
    .eq('show_id', params.id)
    .order('position');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows/:id/gt-templates — create GT template
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!body.vmix_input_key?.trim()) {
    return NextResponse.json({ error: 'vmix_input_key is required' }, { status: 400 });
  }

  // Get next position
  const { data: last } = await supabase
    .from('od_gt_templates')
    .select('position')
    .eq('show_id', params.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = last ? last.position + 1 : 0;

  const { data, error } = await supabase
    .from('od_gt_templates')
    .insert({
      show_id: params.id,
      name,
      vmix_input_key: body.vmix_input_key.trim(),
      overlay_number: body.overlay_number ?? 2,
      fields: body.fields ?? [],
      position,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'gt_template_created',
      payload: { gt_template: data },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data, { status: 201 });
}
