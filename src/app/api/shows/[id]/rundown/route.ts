import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shows/:id/rundown — full rundown (show + config + blocks + elements + actions)
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // Fetch show + config + prompter config + gt templates in parallel
  const [showResult, configResult, prompterResult, blocksResult, gtResult] = await Promise.all([
    supabase.from('od_shows').select('*').eq('id', params.id).single(),
    supabase.from('od_show_config').select('*').eq('show_id', params.id).single(),
    supabase.from('od_prompter_config').select('*').eq('show_id', params.id).single(),
    supabase.from('od_blocks').select('*').eq('show_id', params.id).order('position'),
    supabase.from('od_gt_templates').select('*').eq('show_id', params.id).order('position'),
  ]);

  if (showResult.error) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  if (blocksResult.error) {
    return NextResponse.json({ error: blocksResult.error.message }, { status: 500 });
  }

  const blocks = blocksResult.data || [];
  const blockIds = blocks.map((b: { id: string }) => b.id);

  // Fetch elements and actions in parallel
  let elements: Record<string, unknown>[] = [];
  let actions: Record<string, unknown>[] = [];

  if (blockIds.length > 0) {
    const [elemResult] = await Promise.all([
      supabase.from('od_elements').select('*').in('block_id', blockIds).order('position'),
    ]);

    if (elemResult.error) {
      return NextResponse.json({ error: elemResult.error.message }, { status: 500 });
    }
    elements = elemResult.data || [];

    // Fetch actions for all elements
    const elementIds = elements.map((e) => String(e.id));
    if (elementIds.length > 0) {
      const { data: actData, error: actError } = await supabase
        .from('od_actions')
        .select('*')
        .in('element_id', elementIds)
        .order('position');

      if (actError) {
        console.error('Actions fetch error:', actError);
      }
      if (actData) {
        actions = actData;
      }
    }
  }

  // Group actions by element_id
  const actionsByElement = new Map<string, Record<string, unknown>[]>();
  for (const act of actions) {
    const eid = act.element_id as string;
    if (!actionsByElement.has(eid)) {
      actionsByElement.set(eid, []);
    }
    actionsByElement.get(eid)!.push(act);
  }

  // Group elements by block_id (with actions attached)
  const elementsByBlock = new Map<string, Record<string, unknown>[]>();
  for (const el of elements) {
    const bid = el.block_id as string;
    const eid = el.id as string;
    const elementWithActions = {
      ...el,
      actions: actionsByElement.get(eid) || [],
    };
    if (!elementsByBlock.has(bid)) {
      elementsByBlock.set(bid, []);
    }
    elementsByBlock.get(bid)!.push(elementWithActions);
  }

  const rundown = {
    show: showResult.data,
    config: configResult.data || null,
    prompter_config: prompterResult.data || null,
    gt_templates: gtResult.data || [],
    blocks: blocks.map((b: { id: string }) => ({
      ...b,
      elements: elementsByBlock.get(b.id) || [],
    })),
  };

  return NextResponse.json(rundown);
}
