import { requireAdmin } from '../../_auth';
import { readD1FeeSettings } from '../../../../src/server/paymentProcessor';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const admin = await requireAdmin(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!admin.success || !admin.user) {
      return new Response(JSON.stringify({ success: false, error: admin.error }), { status: admin.status, headers: CORS });
    }

    const body: any = await request.json().catch(() => ({}));
    const earnerFee = Math.max(100, Number(body.earner_fee ?? body.earnerFee ?? 2000) || 2000);
    const employerFee = Math.max(100, Number(body.employer_fee ?? body.employerFee ?? 5000) || 5000);
    const bonusEarner = Math.max(0, Number(body.activation_bonus_earner ?? 0) || 0);
    const bonusEmployer = Math.max(0, Number(body.activation_bonus_employer ?? 0) || 0);
    const nowIso = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('earner_activation_fee', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(earnerFee), nowIso),
      env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('employer_activation_fee', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(employerFee), nowIso),
      env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('activation_bonus_earner', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(bonusEarner), nowIso),
      env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('activation_bonus_employer', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(bonusEmployer), nowIso),
    ]);

    const fees = await readD1FeeSettings(env.DB);
    return new Response(JSON.stringify({ success: true, message: 'Activation fee settings saved.', fees }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
