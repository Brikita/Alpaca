import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

interface AutomationEnvironment { VOLGUARD_CONTROL_URL?: string }

export async function GET(): Promise<Response> {
  const binding = env as unknown as AutomationEnvironment;
  const baseUrl = binding.VOLGUARD_CONTROL_URL ?? process.env.VOLGUARD_CONTROL_URL;
  if (!baseUrl) {
    return Response.json({ error: 'Automation status is not configured.' }, { status: 503 });
  }
  try {
    const response = await fetch(new URL('/status', baseUrl), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Status endpoint returned ${response.status}.`);
    return new Response(response.body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store, max-age=0' },
    });
  } catch {
    return Response.json({ error: 'Automation status is unavailable.' }, { status: 502 });
  }
}
