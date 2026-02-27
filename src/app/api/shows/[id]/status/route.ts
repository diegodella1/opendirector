import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTransition } from '@/lib/state-machine';
import type { ShowStatus } from '@/lib/types';

// PUT /api/shows/:id/status — change show status with state machine validation
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const newStatus = body.status as ShowStatus;

  if (!newStatus) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  // Fetch current show
  const { data: show, error: fetchError } = await supabase
    .from('od_shows')
    .select('id, status, version')
    .eq('id', params.id)
    .single();

  if (fetchError || !show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Validate transition
  const result = validateTransition(show.status, newStatus);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  // Update status
  const updates: Record<string, unknown> = {
    status: newStatus,
    version: show.version + 1,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'archived') {
    updates.archived_at = new Date().toISOString();
  } else if (show.status === 'archived') {
    updates.archived_at = null;
  }

  const { data, error } = await supabase
    .from('od_shows')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast status change
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'execution',
      type: 'show_status_changed',
      payload: { status: newStatus, previousStatus: show.status },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}
