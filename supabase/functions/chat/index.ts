// Supabase Edge Function: server-side OpenRouter proxy.
// The OpenRouter key never reaches the phone or browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MONTHLY_CAP = Number(Deno.env.get('ORM_MONTHLY_CAP_USD') ?? '5');
const PRICES: Record<string, { input: number; output: number }> = {
  'tencent/hy4-flash': { input: 0.0000001, output: 0.0000004 },
  'deepseek/deepseek-v4.1-flash-1017': { input: 0.0000001, output: 0.0000004 },
  'nvidia/nemotron-3-ultra-550b-a55b:free': { input: 0, output: 0 },
  'openrouter/free': { input: 0, output: 0 },
};
function estimateCost(model: string, prompt: number, completion: number): number {
  const price = PRICES[model] ?? { input: 0.000001, output: 0.000003 };
  return prompt * price.input + completion * price.output;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Missing access token');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: 'Bearer ' + token } } },
    );
    const { data, error: authError } = await supabase.auth.getUser(token);
    const user = data && data.user;
    if (authError || !user) throw new Error('Invalid session');
    const spent = await supabase.schema('orm').rpc('ai_spend_this_month', { uid: user.id });
    if ((spent.data || 0) >= MONTHLY_CAP) {
      return new Response(
        JSON.stringify({ error: 'Monthly AI cap of $' + MONTHLY_CAP + ' reached.' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    const body = await req.json();
    const model = String(body.model || '');
    const messages = body.messages;
    if (!model || !Array.isArray(messages)) throw new Error('model and messages are required');
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) throw new Error('OPENROUTER_API_KEY is not configured on the server');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + openRouterKey,
        'HTTP-Referer': 'https://ormobile.app',
        'X-Title': 'ORMobile',
      },
      body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return new Response(detail, { status: response.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const upstream = response.body;
    if (!upstream) throw new Error('No response body from model');
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let promptTokens = 0;
        let completionTokens = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              try {
                const payload = JSON.parse(line.slice(5).trim());
                if (payload && payload.usage) {
                  promptTokens = payload.usage.prompt_tokens || promptTokens;
                  completionTokens = payload.usage.completion_tokens || completionTokens;
                }
              } catch (_) {}
            }
          }
        } finally {
          controller.close();
          const cost = estimateCost(model, promptTokens, completionTokens);
          await supabase.from('ai_usage').insert({
            user_id: user.id,
            model,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            estimated_cost: cost,
          });
        }
      },
    });
    return new Response(stream, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
