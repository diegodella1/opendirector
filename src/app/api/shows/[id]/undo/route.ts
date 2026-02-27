import { NextResponse } from 'next/server';
import { popUndoEntry, applyData } from '@/lib/undo';

// POST /api/shows/:id/undo — pop last undo entry, apply reverse_data
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const entry = await popUndoEntry(params.id);

  if (!entry) {
    return NextResponse.json({ error: 'Nothing to undo' }, { status: 404 });
  }

  // Apply the reverse data
  const result = await applyData(params.id, entry.action_type, entry.reverse_data);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Broadcast undo
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'rundown',
      type: 'undo_applied',
      payload: { actionType: entry.action_type },
      timestamp: new Date().toISOString(),
    });
  }

  // Return forward_data so client can push to redo stack
  return NextResponse.json({
    actionType: entry.action_type,
    forwardData: entry.forward_data,
    reverseData: entry.reverse_data,
  });
}
