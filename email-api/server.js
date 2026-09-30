/**
 * Lanwei order email API — Node + nodemailer + Aliyun enterprise SMTP.
 * Accepts the same POST JSON as the former Cloudflare/Resend worker.
 * Always delivers to sales@vivebio.cn; never emails the customer.
 */
'use strict';

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 8787);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qiye.aliyun.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'orders@vivebio.cn';
const SMTP_PASS = process.env.ALIYUN_MAIL_SMTP_PASS || process.env.SMTP_PASS || '';
const FROM_EMAIL = (process.env.FROM_EMAIL || '订单通知 <orders@vivebio.cn>').trim();
const SALES_TO = (process.env.SALES_TO || 'sales@vivebio.cn').trim();

const DEFAULT_ORIGINS = [
  'https://order.vivebio.cn',
  'https://shidimeng1983.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...raw, ...DEFAULT_ORIGINS]));
}

const ALLOWED = parseAllowedOrigins();

function decodeMaybeBase64(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<table')
  ) {
    return value;
  }
  try {
    return Buffer.from(trimmed.replace(/\s/g, ''), 'base64').toString('utf8');
  } catch {
    return value;
  }
}

function safeFilename(name, fallback) {
  const n = (name || fallback || 'attachment.html').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  return n || fallback;
}

function ensureHtmlName(name) {
  return name.endsWith('.html') ? name : name + '.html';
}

let transporter = null;

function getTransporter() {
  if (!SMTP_PASS) {
    throw new Error('ALIYUN_MAIL_SMTP_PASS not configured');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

app.use(
  cors({
    origin(origin, cb) {
      // Non-browser / same-origin / curl: no Origin header
      if (!origin) return cb(null, true);
      if (ALLOWED.includes(origin)) return cb(null, true);
      return cb(new Error('origin not allowed'));
    },
    methods: ['POST', 'OPTIONS', 'GET'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86400,
  })
);

app.use((err, _req, res, next) => {
  if (err && err.message === 'origin not allowed') {
    return res.status(403).json({ ok: false, error: 'origin not allowed' });
  }
  return next(err);
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'lanwei-order-email-api',
    smtp: SMTP_HOST,
    from: FROM_EMAIL,
    to: SALES_TO,
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(SMTP_PASS) });
});

app.post('/', async (req, res) => {
  try {
    if (!SMTP_PASS) {
      return res.status(503).json({ ok: false, error: 'ALIYUN_MAIL_SMTP_PASS not configured' });
    }

    const body = req.body || {};
    const to = SALES_TO;
    const subject = (
      body.subject ||
      body.subject_sales ||
      `【览微在线下单】${(body.order && body.order.name) || ''}`
    )
      .toString()
      .slice(0, 200);
    const textBody = (body.body || body.body_sales || '').toString().slice(0, 50000);

    const contractHtml =
      decodeMaybeBase64(body.contract_html) || decodeMaybeBase64(body.contract_pdf) || '';
    const packingHtml =
      decodeMaybeBase64(body.packing_html) || decodeMaybeBase64(body.packing_pdf) || '';

    if (!contractHtml && !packingHtml && !textBody) {
      return res.status(400).json({ ok: false, error: 'empty payload' });
    }

    const orderName = (body.order && body.order.name) || 'order';
    const dateTag = new Date().toISOString().slice(0, 10);
    const contractName = ensureHtmlName(
      safeFilename(body.contract_filename, `订购确认_${orderName}_${dateTag}.html`)
    );
    const packingName = ensureHtmlName(
      safeFilename(body.packing_filename, `配货单_${orderName}_${dateTag}.html`)
    );

    const attachments = [];
    if (contractHtml) {
      attachments.push({
        filename: contractName,
        content: contractHtml,
        contentType: 'text/html; charset=utf-8',
      });
    }
    if (packingHtml) {
      attachments.push({
        filename: packingName,
        content: packingHtml,
        contentType: 'text/html; charset=utf-8',
      });
    }

    const info = await getTransporter().sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text: textBody || '览微在线下单：见附件订购确认与配货单。',
      attachments,
    });

    return res.json({
      ok: true,
      id: info.messageId || null,
      to,
      response: info.response || null,
    });
  } catch (err) {
    console.error('send failed', err && err.message ? err.message : err);
    // Avoid HTTP 502: Cloudflare quick tunnels replace origin 502 with an HTML error page.
    return res.status(503).json({
      ok: false,
      error: 'smtp_failed',
      detail: (err && err.message ? err.message : String(err)).slice(0, 300),
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `lanwei-order-email-api listening on :${PORT} smtp=${SMTP_HOST}:${SMTP_PORT} user=${SMTP_USER} from=${FROM_EMAIL} to=${SALES_TO}`
  );
});
