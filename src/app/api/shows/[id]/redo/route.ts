import { NextResponse } from 'next/server';
import { applyData, recordUndoEntry } from '@/lib/undo';
export const dynamic = 'force-dynamic';

// POST /api/shows/:id/redo — apply forward_data, create new undo entry
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { actionType, forwardData, reverseData } = body;

  if (!actionType || !forwardData || !reverseData) {
    return NextResponse.json(
      { error: 'actionType, forwardData, and reverseData are required' },
      { status: 400 }
    );
  }

  // Apply forward data
  const result = await applyData(params.id, actionType, forwardData);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Record undo entry so this can be undone again
  await recordUndoEntry(params.id, actionType, forwardData, reverseData);

  // Broadcast redo
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'redo_applied',
      payload: { actionType },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
