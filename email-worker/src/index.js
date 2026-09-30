/**
 * Lanwei order email gateway (Cloudflare Worker + Resend).
 * Accepts POST from the order page; sends 订购确认 + 配货单 ONLY to sales@vivebio.cn.
 * Never emails the customer.
 */

const DEFAULT_SALES = 'sales@vivebio.cn';

function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function parseAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Always allow github.io pages for this project + custom domain + local dev
  const extras = [
    'https://shidimeng1983.github.io',
    'https://order.vivebio.cn',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  return Array.from(new Set([...raw, ...extras]));
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function decodeMaybeBase64(value) {
  if (!value || typeof value !== 'string') return '';
  // If it looks like HTML already, return as-is
  const trimmed = value.trim();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<div') || trimmed.startsWith('<table')) {
    return value;
  }
  try {
    // atob in Workers
    const bin = atob(trimmed.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

function safeFilename(name, fallback) {
  const n = (name || fallback || 'attachment.html').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  return n || fallback;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str || '');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default {
  async fetch(request, env) {
    const allowed = parseAllowedOrigins(env);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      if (origin && !allowed.includes(origin)) {
        return json({ ok: false, error: 'origin not allowed' }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method not allowed' }, 405, cors);
    }

    if (origin && !allowed.includes(origin)) {
      return json({ ok: false, error: 'origin not allowed' }, 403, cors);
    }

    if (!env.RESEND_API_KEY) {
      return json({ ok: false, error: 'RESEND_API_KEY not configured' }, 503, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid JSON' }, 400, cors);
    }

    const salesTo = (env.SALES_TO || DEFAULT_SALES).trim();
    // Force sales-only recipient regardless of client payload
    const to = salesTo;
    const subject = (body.subject || body.subject_sales || `【览微在线下单】${(body.order && body.order.name) || ''}`).toString().slice(0, 200);
    const textBody = (body.body || body.body_sales || '').toString().slice(0, 50000);

    const contractHtml =
      decodeMaybeBase64(body.contract_html) ||
      decodeMaybeBase64(body.contract_pdf) ||
      '';
    const packingHtml =
      decodeMaybeBase64(body.packing_html) ||
      decodeMaybeBase64(body.packing_pdf) ||
      '';

    if (!contractHtml && !packingHtml && !textBody) {
      return json({ ok: false, error: 'empty payload' }, 400, cors);
    }

    const orderName = (body.order && body.order.name) || 'order';
    const dateTag = new Date().toISOString().slice(0, 10);
    const contractName = safeFilename(body.contract_filename, `订购确认_${orderName}_${dateTag}.html`);
    const packingName = safeFilename(body.packing_filename, `配货单_${orderName}_${dateTag}.html`);
    const ctype = (body.attachment_content_type || 'text/html; charset=utf-8').toString();

    const attachments = [];
    if (contractHtml) {
      attachments.push({
        filename: contractName.endsWith('.html') ? contractName : contractName + '.html',
        content: toBase64Utf8(contractHtml),
        content_type: ctype.includes('html') ? 'text/html' : ctype,
      });
    }
    if (packingHtml) {
      attachments.push({
        filename: packingName.endsWith('.html') ? packingName : packingName + '.html',
        content: toBase64Utf8(packingHtml),
        content_type: ctype.includes('html') ? 'text/html' : ctype,
      });
    }

    const from = (env.FROM_EMAIL || '订单通知 <orders@vivebio.cn>').trim();

    const resendPayload = {
      from,
      to: [to],
      subject,
      text: textBody || '览微在线下单：见附件订购确认与配货单。',
      attachments,
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    const raw = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }

    if (!resp.ok) {
      console.error('Resend error', resp.status, raw.slice(0, 500));
      return json({
        ok: false,
        error: 'resend_failed',
        status: resp.status,
        detail: parsed || raw.slice(0, 300),
      }, 502, cors);
    }

    return json({ ok: true, id: parsed && parsed.id ? parsed.id : null, to }, 200, cors);
  },
};
