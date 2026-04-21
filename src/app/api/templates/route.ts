import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { TemplateSnapshot } from '@/lib/types';
export const dynamic = 'force-dynamic';

// GET /api/templates — list all templates
export async function GET() {
  const { data, error } = await supabase
    .from('od_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/templates — save a show as a template
export async function POST(request: Request) {
  const body = await request.json();
  const { showId, name, description } = body;

  if (!showId || !name) {
    return NextResponse.json({ error: 'showId and name are required' }, { status: 400 });
  }

  // Fetch full rundown
  const [showRes, configRes, blocksRes, peopleRes] = await Promise.all([
    supabase.from('od_shows').select('*').eq('id', showId).single(),
    supabase.from('od_show_config').select('*').eq('show_id', showId).single(),
    supabase.from('od_blocks').select('*').eq('show_id', showId).order('position'),
    supabase.from('od_people').select('*').eq('show_id', showId).order('position'),
  ]);

  if (showRes.error) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const blocks = blocksRes.data || [];
  const blockIds = blocks.map((b: { id: string }) => b.id);

  // Fetch elements
  let elements: Record<string, unknown>[] = [];
  if (blockIds.length > 0) {
    const { data: elData } = await supabase
      .from('od_elements')
      .select('*')
      .in('block_id', blockIds)
      .order('position');
    elements = elData || [];
  }

  // Fetch actions
  const elementIds = elements.map((e) => String(e.id));
  let actions: Record<string, unknown>[] = [];
  if (elementIds.length > 0) {
    const { data: actData } = await supabase
      .from('od_actions')
      .select('*')
      .in('element_id', elementIds)
      .order('position');
    actions = actData || [];
  }

  // Group actions by element_id
  const actionsByElement = new Map<string, Record<string, unknown>[]>();
  for (const act of actions) {
    const eid = act.element_id as string;
    if (!actionsByElement.has(eid)) actionsByElement.set(eid, []);
    actionsByElement.get(eid)!.push(act);
  }

  // Group elements by block_id
  const elementsByBlock = new Map<string, Record<string, unknown>[]>();
  for (const el of elements) {
    const bid = el.block_id as string;
    if (!elementsByBlock.has(bid)) elementsByBlock.set(bid, []);
    elementsByBlock.get(bid)!.push(el);
  }

  // Build template snapshot (strip IDs)
  const config = configRes.data || {};
  const snapshot: TemplateSnapshot = {
    version: 1,
    name,
    config: {
      action_delay_ms: config.action_delay_ms,
      overrun_behavior: config.overrun_behavior,
    },
    blocks: blocks.map((b: Record<string, unknown>) => ({
      name: b.name as string,
      position: b.position as number,
      estimated_duration_sec: (b.estimated_duration_sec as number) || 0,
      script: (b.script as string) || null,
      elements: (elementsByBlock.get(b.id as string) || []).map((el) => ({
        type: el.type as string,
        position: el.position as number,
        title: (el.title as string) || null,
        subtitle: (el.subtitle as string) || null,
        duration_sec: (el.duration_sec as number) || null,
        style: (el.style as string) || 'standard',
        mode: (el.mode as string) || 'fullscreen',
        trigger_type: (el.trigger_type as string) || 'manual',
        actions: (actionsByElement.get(el.id as string) || []).map((act) => ({
          phase: act.phase as string,
          step_label: (act.step_label as string) || null,
          position: act.position as number,
          vmix_function: act.vmix_function as string,
          target: (act.target as string) || null,
          field: (act.field as string) || null,
          value: (act.value as string) || null,
          delay_ms: (act.delay_ms as number) || 0,
        })),
      })),
    })),
    people: (peopleRes.data || []).map((p: Record<string, unknown>) => ({
      name: p.name as string,
      role: (p.role as string) || null,
    })),
  };

  // Write JSON file
  const filename = `custom-${randomUUID()}.json`;
  const templatesDir = path.join(process.cwd(), 'data', 'templates');
  await mkdir(templatesDir, { recursive: true });
  const filePath = path.join(templatesDir, filename);
  await writeFile(filePath, JSON.stringify(snapshot, null, 2));

  // Insert metadata
  const { data: template, error: insertError } = await supabase
    .from('od_templates')
    .insert({
      name,
      description: description || null,
      filename,
      is_builtin: false,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(template, { status: 201 });
}
