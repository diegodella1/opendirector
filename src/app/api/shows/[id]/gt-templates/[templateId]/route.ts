import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

// PUT /api/shows/:id/gt-templates/:templateId — update GT template
export async function PUT(
  request: Request,
  { params }: { params: { id: string; templateId: string } }
) {
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.vmix_input_key !== undefined) updates.vmix_input_key = body.vmix_input_key.trim();
  if (body.overlay_number !== undefined) updates.overlay_number = body.overlay_number;
  if (body.fields !== undefined) updates.fields = body.fields;
  if (body.position !== undefined) updates.position = body.position;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('od_gt_templates')
    .update(updates)
    .eq('id', params.templateId)
    .eq('show_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'gt_template_updated',
      payload: { gt_template: data },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/shows/:id/gt-templates/:templateId
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; templateId: string } }
) {
  const { error } = await supabase
    .from('od_gt_templates')
    .delete()
    .eq('id', params.templateId)
    .eq('show_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'gt_template_deleted',
      payload: { templateId: params.templateId },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
