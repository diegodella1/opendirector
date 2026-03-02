import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { readFile } from 'fs/promises';
import path from 'path';
import type { TemplateSnapshot } from '@/lib/types';
export const dynamic = 'force-dynamic';

// POST /api/shows/from-template/:templateId — create a new show from a template
export async function POST(
  request: Request,
  { params }: { params: { templateId: string } }
) {
  const body = await request.json();
  const showName = body.name?.trim();

  if (!showName) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Fetch template metadata
  const { data: template, error: tplError } = await supabase
    .from('od_templates')
    .select('*')
    .eq('id', params.templateId)
    .single();

  if (tplError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Read template JSON
  const filePath = path.join(process.cwd(), 'data', 'templates', template.filename);
  let snapshot: TemplateSnapshot;
  try {
    const content = await readFile(filePath, 'utf-8');
    snapshot = JSON.parse(content);
  } catch {
    return NextResponse.json({ error: 'Template file not found' }, { status: 404 });
  }

  // Create show
  const { data: show, error: showError } = await supabase
    .from('od_shows')
    .insert({ name: showName })
    .select()
    .single();

  if (showError || !show) {
    return NextResponse.json({ error: showError?.message || 'Failed to create show' }, { status: 500 });
  }

  // Create config with template values
  const configData: Record<string, unknown> = { show_id: show.id };
  if (snapshot.config) {
    if (snapshot.config.action_delay_ms !== undefined) configData.action_delay_ms = snapshot.config.action_delay_ms;
    if (snapshot.config.overrun_behavior !== undefined) configData.overrun_behavior = snapshot.config.overrun_behavior;
  }

  await Promise.all([
    supabase.from('od_show_config').insert(configData),
    supabase.from('od_prompter_config').insert({ show_id: show.id }),
  ]);

  // Create blocks, elements, and actions
  for (const block of snapshot.blocks) {
    const { data: newBlock } = await supabase
      .from('od_blocks')
      .insert({
        show_id: show.id,
        name: block.name,
        position: block.position,
        estimated_duration_sec: block.estimated_duration_sec,
        script: block.script,
      })
      .select()
      .single();

    if (!newBlock) continue;

    for (const el of block.elements) {
      const { data: newEl } = await supabase
        .from('od_elements')
        .insert({
          block_id: newBlock.id,
          type: el.type,
          position: el.position,
          title: el.title,
          subtitle: el.subtitle,
          duration_sec: el.duration_sec,
          style: el.style,
          mode: el.mode,
          trigger_type: el.trigger_type,
        })
        .select()
        .single();

      if (!newEl) continue;

      for (const act of el.actions) {
        await supabase.from('od_actions').insert({
          element_id: newEl.id,
          phase: act.phase,
          step_label: act.step_label,
          position: act.position,
          vmix_function: act.vmix_function,
          target: act.target,
          field: act.field,
          value: act.value,
          delay_ms: act.delay_ms,
        });
      }
    }
  }

  // Create people
  if (snapshot.people) {
    for (let i = 0; i < snapshot.people.length; i++) {
      const person = snapshot.people[i];
      await supabase.from('od_people').insert({
        show_id: show.id,
        name: person.name,
        role: person.role,
        position: i,
      });
    }
  }

  return NextResponse.json(show, { status: 201 });
}
