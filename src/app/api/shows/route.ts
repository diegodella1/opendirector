import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

// GET /api/shows — list all shows
export async function GET() {
  const { data, error } = await supabase
    .from('od_shows')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows — create a new show (+ config + prompter_config)
export async function POST(request: Request) {
  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Create show
  const { data: show, error: showError } = await supabase
    .from('od_shows')
    .insert({ name })
    .select()
    .single();

  if (showError) {
    return NextResponse.json({ error: showError.message }, { status: 500 });
  }

  // Create default config and prompter_config
  const [configResult, prompterResult] = await Promise.all([
    supabase.from('od_show_config').insert({ show_id: show.id }),
    supabase.from('od_prompter_config').insert({ show_id: show.id }),
  ]);

  if (configResult.error || prompterResult.error) {
    // Cleanup the show if config creation fails
    await supabase.from('od_shows').delete().eq('id', show.id);
    return NextResponse.json(
      { error: 'Failed to create show config' },
      { status: 500 }
    );
  }

  return NextResponse.json(show, { status: 201 });
}
