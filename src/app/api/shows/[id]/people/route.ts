import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

// GET /api/shows/:id/people
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_people')
    .select('*')
    .eq('show_id', params.id)
    .order('position');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/shows/:id/people
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  // Get next position
  const { data: existing } = await supabase
    .from('od_people')
    .select('position')
    .eq('show_id', params.id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from('od_people')
    .insert({
      show_id: params.id,
      name: body.name || 'New Person',
      role: body.role || null,
      vmix_input_key: body.vmix_input_key || null,
      audio_bus: body.audio_bus || 'A',
      auto_lower_third: body.auto_lower_third ?? true,
      lower_third_line1: body.lower_third_line1 || null,
      lower_third_line2: body.lower_third_line2 || null,
      position: nextPos,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
