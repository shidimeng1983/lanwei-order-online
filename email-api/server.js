/**
 * Lanwei order email API — Node + nodemailer + Aliyun enterprise SMTP.
 * Accepts the same POST JSON as the former Cloudflare/Resend worker.
 * Always delivers to sales@vivebio.cn; never emails the customer.
 *
 * Attachments:
 *   - contract: real PDF (contract_pdf base64 + .pdf filename) or HTML fallback
 *   - packing: optional packing_csv (.csv) or HTML via packing_html / legacy packing_pdf
 */
'use strict';

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 8787);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qiye.aliyun.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'order@vivebio.cn';
const SMTP_PASS = process.env.ALIYUN_MAIL_SMTP_PASS || process.env.SMTP_PASS || '';
const FROM_EMAIL = (process.env.FROM_EMAIL || '订单通知 <order@vivebio.cn>').trim();
const SALES_TO = (process.env.SALES_TO || 'sales@vivebio.cn').trim();

const DEFAULT_ORIGINS = [
  'https://order.vivebio.cn',
  'http://order.vivebio.cn',
  'https://shidimeng1983.github.io',
  'http://shidimeng1983.github.io',
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

function looksLikeHtml(value) {
  if (!value || typeof value !== 'string') return false;
  const t = value.trim().toLowerCase();
  return (
    t.startsWith('<!') ||
    t.startsWith('<html') ||
    t.startsWith('<div') ||
    t.startsWith('<table') ||
    t.startsWith('<body') ||
    t.startsWith('<p') ||
    t.startsWith('<h1')
  );
}

function stripDataUriBase64(value) {
  if (!value || typeof value !== 'string') return '';
  const t = value.trim();
  if (t.startsWith('data:') && t.includes(',')) {
    return t.slice(t.indexOf(',') + 1).replace(/\s/g, '');
  }
  return t.replace(/\s/g, '');
}

/** True if value is base64 (or data-URI) of a PDF (%PDF → JVBERi). */
function isPdfBase64(value) {
  if (!value || typeof value !== 'string') return false;
  const b64 = stripDataUriBase64(value);
  return b64.startsWith('JVBERi');
}

function decodeMaybeBase64(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (looksLikeHtml(trimmed)) {
    return value;
  }
  try {
    return Buffer.from(trimmed.replace(/\s/g, ''), 'base64').toString('utf8');
  } catch {
    return value;
  }
}

/**
 * packing_csv may be raw UTF-8 CSV text or base64 of that text.
 */
function decodeCsvMaybe(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // data:text/csv;base64,...
  if (trimmed.startsWith('data:') && trimmed.includes(',')) {
    const b64 = stripDataUriBase64(trimmed);
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  // Looks like plain CSV / TSV text
  if (/[,\t]/.test(trimmed) || trimmed.includes('\n') || trimmed.includes('\r')) {
    // Ambiguous: could be base64 without commas — prefer plain text when newlines/commas present
    return value;
  }
  // Pure base64-ish → try decode
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length >= 8) {
    try {
      const decoded = Buffer.from(trimmed.replace(/\s/g, ''), 'base64').toString('utf8');
      if (decoded && !decoded.includes('\u0000')) return decoded;
    } catch {
      /* fall through */
    }
  }
  return value;
}

function safeFilename(name, fallback) {
  const n = (name || fallback || 'attachment').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  return n || fallback || 'attachment';
}

function ensureExt(name, ext) {
  const e = ext.startsWith('.') ? ext : `.${ext}`;
  const re = /\.(html?|pdf|csv)$/i;
  if (name.toLowerCase().endsWith(e.toLowerCase())) return name;
  return name.replace(re, '') + e;
}

/**
 * Build nodemailer attachments from request body.
 * Exported for unit/smoke checks (no SMTP).
 */
function buildMailAttachments(body) {
  const attachments = [];
  const orderName = (body.order && body.order.name) || 'order';
  const dateTag = new Date().toISOString().slice(0, 10);

  const contractFnHint = body.contract_filename || '';
  const contractCtHint = String(body.contract_content_type || '').toLowerCase();
  const pdfField = body.contract_pdf;
  const htmlField = body.contract_html;

  const wantPdf =
    /\.pdf$/i.test(contractFnHint) ||
    contractCtHint.includes('application/pdf') ||
    isPdfBase64(pdfField);

  let contractAttached = false;

  if (wantPdf && pdfField && !looksLikeHtml(pdfField)) {
    const b64 = stripDataUriBase64(pdfField);
    if (b64 && (isPdfBase64(b64) || !looksLikeHtml(Buffer.from(b64, 'base64').toString('utf8').slice(0, 32)))) {
      attachments.push({
        filename: ensureExt(
          safeFilename(contractFnHint, `订购合同_${orderName}_${dateTag}.pdf`),
          '.pdf'
        ),
        content: Buffer.from(b64, 'base64'),
        contentType: 'application/pdf',
      });
      contractAttached = true;
    }
  }

  if (!contractAttached) {
    const contractHtml =
      (htmlField
        ? looksLikeHtml(htmlField)
          ? htmlField
          : decodeMaybeBase64(htmlField)
        : '') ||
      (pdfField
        ? looksLikeHtml(pdfField)
          ? pdfField
          : decodeMaybeBase64(pdfField)
        : '') ||
      '';
    if (contractHtml) {
      const htmlName = ensureExt(
        safeFilename(
          contractFnHint && !/\.pdf$/i.test(contractFnHint)
            ? contractFnHint
            : `订购确认_${orderName}_${dateTag}.html`,
          `订购确认_${orderName}_${dateTag}.html`
        ),
        '.html'
      );
      attachments.push({
        filename: htmlName,
        content: contractHtml,
        contentType: 'text/html; charset=utf-8',
      });
    }
  }

  // Packing: prefer CSV when provided; else HTML (packing_html / legacy packing_pdf-as-HTML)
  if (body.packing_csv != null && String(body.packing_csv).trim() !== '') {
    const csvContent = decodeCsvMaybe(String(body.packing_csv));
    if (csvContent) {
      attachments.push({
        filename: ensureExt(
          safeFilename(body.packing_filename, `配货单_${orderName}_${dateTag}.csv`),
          '.csv'
        ),
        content: csvContent,
        contentType: 'text/csv; charset=utf-8',
      });
    }
  } else {
    const packingRaw = body.packing_html || body.packing_pdf || '';
    let packingHtml = '';
    if (packingRaw) {
      if (isPdfBase64(packingRaw) && !looksLikeHtml(packingRaw)) {
        // Unexpected binary PDF for packing — skip HTML decode, attach as PDF if named .pdf
        if (/\.pdf$/i.test(body.packing_filename || '')) {
          attachments.push({
            filename: ensureExt(
              safeFilename(body.packing_filename, `配货单_${orderName}_${dateTag}.pdf`),
              '.pdf'
            ),
            content: Buffer.from(stripDataUriBase64(packingRaw), 'base64'),
            contentType: 'application/pdf',
          });
        }
      } else {
        packingHtml = looksLikeHtml(packingRaw) ? packingRaw : decodeMaybeBase64(packingRaw);
      }
    }
    if (packingHtml) {
      attachments.push({
        filename: ensureExt(
          safeFilename(body.packing_filename, `配货单_${orderName}_${dateTag}.html`),
          '.html'
        ),
        content: packingHtml,
        contentType: 'text/html; charset=utf-8',
      });
    }
  }

  return attachments;
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
// Contracts with seal rasterized to PDF can exceed a few MB as JSON base64
app.use(express.json({ limit: '16mb' }));

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

    const attachments = buildMailAttachments(body);

    if (!attachments.length && !textBody) {
      return res.status(400).json({ ok: false, error: 'empty payload' });
    }

    const info = await getTransporter().sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text: textBody || '览微在线下单：见附件订购合同与配货单。',
      attachments,
    });

    return res.json({
      ok: true,
      id: info.messageId || null,
      to,
      response: info.response || null,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
      })),
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

module.exports = {
  app,
  buildMailAttachments,
  isPdfBase64,
  decodeCsvMaybe,
  ensureExt,
  safeFilename,
};

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `lanwei-order-email-api listening on :${PORT} smtp=${SMTP_HOST}:${SMTP_PORT} user=${SMTP_USER} from=${FROM_EMAIL} to=${SALES_TO}`
    );
  });
}
