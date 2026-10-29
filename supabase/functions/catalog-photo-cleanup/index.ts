import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { cleanupPhotoJob } from "./cleanup.ts";

// Each request carries an unguessable, single-job capability created inside Postgres.
// Browser users never receive this token or the service key.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const input = await request.json().catch(() => null);
  if (
    !input ||
    !/^[0-9a-f-]{36}$/i.test(input.id ?? "") ||
    !/^[0-9a-f]{48}$/.test(input.token ?? "")
  ) {
    return new Response(null, { status: 401 });
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const params = { p_id: input.id, p_token: input.token };
  const { data: job, error } = await client.rpc(
    "claim_catalog_photo_cleanup",
    params,
  );
  if (error) return new Response(null, { status: 503 });
  if (!job) return new Response(null, { status: 202 });
  try {
    const bucket = client.storage.from("restaurant-photos");
    await cleanupPhotoJob(bucket, job);
    const { error } = await client.rpc(
      "complete_catalog_photo_cleanup",
      params,
    );
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch {
    // Leave the durable job for the scheduled retry, without logging its capability.
    return new Response(null, { status: 503 });
  }
});
