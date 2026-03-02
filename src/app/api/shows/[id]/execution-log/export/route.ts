import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

// GET /api/shows/:id/execution-log/export — export as CSV
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_execution_log')
    .select('*')
    .eq('show_id', params.id)
    .order('timestamp', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];

  // CSV header
  const headers = [
    'timestamp',
    'seq',
    'type',
    'source',
    'operator',
    'block_id',
    'element_id',
    'vmix_command',
    'vmix_response',
    'latency_ms',
    'idempotency_key',
  ];

  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val == null) return '';
      const str = String(val);
      // Escape CSV: wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvLines.push(values.join(','));
  }

  const csv = csvLines.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="as-run-log-${params.id}.csv"`,
    },
  });
}
