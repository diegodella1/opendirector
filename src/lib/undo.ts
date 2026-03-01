import { supabase } from './supabase';

// Record an undo entry for a mutation
export async function recordUndoEntry(
  showId: string,
  actionType: string,
  forwardData: Record<string, unknown>,
  reverseData: Record<string, unknown>
) {
  await supabase.from('od_undo_history').insert({
    show_id: showId,
    action_type: actionType,
    forward_data: forwardData,
    reverse_data: reverseData,
  });

  // Prune to keep last 100
  await pruneHistory(showId);
}

// Get the last undo entry and delete it
export async function popUndoEntry(showId: string) {
  const { data, error } = await supabase
    .from('od_undo_history')
    .select('*')
    .eq('show_id', showId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  // Delete the entry
  await supabase.from('od_undo_history').delete().eq('id', data.id);

  return data;
}

// Apply undo/redo data — execute the appropriate DB mutation
export async function applyData(
  showId: string,
  actionType: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (actionType) {
      case 'create_block': {
        if (data.block) {
          // Redo: recreate block
          await supabase.from('od_blocks').insert(data.block);
        } else if (data.blockId) {
          // Undo: delete the created block
          await supabase.from('od_blocks').delete().eq('id', data.blockId);
        }
        break;
      }
      case 'delete_block': {
        // Forward = { blockId }, reverse = { block, elements, actions }
        if (data.blockId) {
          // Forward (delete)
          await supabase.from('od_blocks').delete().eq('id', data.blockId);
        } else if (data.block) {
          // Reverse (recreate)
          await supabase.from('od_blocks').insert(data.block);
          if (Array.isArray(data.elements)) {
            for (const el of data.elements) {
              await supabase.from('od_elements').insert(el);
            }
          }
          if (Array.isArray(data.actions)) {
            for (const act of data.actions) {
              await supabase.from('od_actions').insert(act);
            }
          }
        }
        break;
      }
      case 'update_block': {
        const { blockId, changes } = data as { blockId: string; changes: Record<string, unknown> };
        await supabase.from('od_blocks').update(changes).eq('id', blockId);
        break;
      }
      case 'create_element': {
        if (data.element) {
          // Redo: recreate element
          await supabase.from('od_elements').insert(data.element);
        } else if (data.elementId) {
          // Undo: delete the created element
          await supabase.from('od_elements').delete().eq('id', data.elementId);
        }
        break;
      }
      case 'delete_element': {
        if (data.elementId) {
          await supabase.from('od_elements').delete().eq('id', data.elementId);
        } else if (data.element) {
          await supabase.from('od_elements').insert(data.element);
          if (Array.isArray(data.actions)) {
            for (const act of data.actions) {
              await supabase.from('od_actions').insert(act);
            }
          }
        }
        break;
      }
      case 'update_element': {
        const { elementId, changes } = data as { elementId: string; changes: Record<string, unknown> };
        await supabase.from('od_elements').update(changes).eq('id', elementId);
        break;
      }
      case 'reorder_blocks': {
        const order = data.order as string[];
        if (order) {
          await Promise.all(
            order.map((id, idx) =>
              supabase.from('od_blocks').update({ position: idx }).eq('id', id)
            )
          );
        }
        break;
      }
      case 'reorder_elements': {
        const { order } = data as { blockId: string; order: string[] };
        if (order) {
          await Promise.all(
            order.map((id, idx) =>
              supabase.from('od_elements').update({ position: idx }).eq('id', id)
            )
          );
        }
        break;
      }
      case 'create_action': {
        if (data.action) {
          // Redo: recreate action
          await supabase.from('od_actions').insert(data.action);
        } else if (data.actionId) {
          // Undo: delete the created action
          await supabase.from('od_actions').delete().eq('id', data.actionId);
        }
        break;
      }
      case 'delete_action': {
        if (data.actionId) {
          // Forward: delete action
          await supabase.from('od_actions').delete().eq('id', data.actionId);
        } else if (data.action) {
          // Reverse: recreate action
          await supabase.from('od_actions').insert(data.action);
        }
        break;
      }
      case 'update_action': {
        const { actionId, changes } = data as { actionId: string; changes: Record<string, unknown> };
        await supabase.from('od_actions').update(changes).eq('id', actionId);
        break;
      }
      case 'reorder_actions': {
        const order = data.order as string[];
        if (order) {
          await Promise.all(
            order.map((id, idx) =>
              supabase.from('od_actions').update({ position: idx }).eq('id', id)
            )
          );
        }
        break;
      }
      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }

    // Increment show version
    const { data: show } = await supabase
      .from('od_shows')
      .select('version')
      .eq('id', showId)
      .single();

    if (show) {
      await supabase
        .from('od_shows')
        .update({ version: show.version + 1, updated_at: new Date().toISOString() })
        .eq('id', showId);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function pruneHistory(showId: string, keep = 100) {
  const { data } = await supabase
    .from('od_undo_history')
    .select('id')
    .eq('show_id', showId)
    .order('created_at', { ascending: false })
    .range(keep, keep + 1000);

  if (data && data.length > 0) {
    const ids = data.map((d: { id: string }) => d.id);
    await supabase.from('od_undo_history').delete().in('id', ids);
  }
}
