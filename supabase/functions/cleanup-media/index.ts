// Service-only scheduled worker for the existing delete flows.
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (request: Request) => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || request.headers.get('Authorization') !== `Bearer ${key}`) return new Response('Forbidden', { status: 403 });
  if (request.method !== 'POST') return new Response('POST required', { status: 405 });
  const client = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
  const { data, error } = await client.from('media_cleanup_queue').select('id,bucket,path').order('id').limit(100);
  if (error) return Response.json({ error: 'Could not read cleanup queue' }, { status: 500 });
  let removed = 0;
  for (const bucket of ['media', 'event-media', 'avatars']) {
    const rows = (data ?? []).filter(row => row.bucket === bucket);
    if (!rows.length) continue;
    const result = await client.storage.from(bucket).remove(rows.map(row => row.path));
    if (result.error) continue; // Keep failed items queued for the next scheduled run.
    const deletion = await client.from('media_cleanup_queue').delete().in('id', rows.map(row => row.id));
    if (!deletion.error) removed += rows.length;
  }
  return Response.json({ removed, remainingInBatch: (data?.length ?? 0) - removed });
});
