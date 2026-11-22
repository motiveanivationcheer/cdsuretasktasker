import type { APIContext } from 'astro';

export function buildWorkerEnv(locals: any): Record<string, any> {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  return {
    FIREBASE_PROJECT_ID: 'cdsure-c360f',
    ADMIN_EMAILS: 'bunnysusanfabio@gmail.com',
    ...runtimeEnv,
  };
}

export function adaptPagesHandler(
  handler?: (ctx: { request: Request; env: any; params: Record<string, any> }) => Promise<Response>
) {
  return async ({ request, locals, params }: APIContext) => {
    if (!handler) {
      return new Response(JSON.stringify({ success: false, error: 'Method not implemented.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handler({
      request,
      env: buildWorkerEnv(locals),
      params: (params || {}) as Record<string, any>,
    });
  };
}
