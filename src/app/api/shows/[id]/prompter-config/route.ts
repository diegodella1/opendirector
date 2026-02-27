import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shows/:id/prompter-config
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_prompter_config')
    .select('*')
    .eq('show_id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Prompter config not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// PUT /api/shows/:id/prompter-config
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  // Remove show_id from update body if present
  delete body.show_id;

  const { data, error } = await supabase
    .from('od_prompter_config')
    .update(body)
    .eq('show_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast config change to prompter clients
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'prompter',
      type: 'config_updated',
      payload: data,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}
