# Lanwei order email worker

Cloudflare Worker that accepts order submissions from the static GitHub Pages / `order.vivebio.cn` site and emails **订购确认 + 配货单** to **`sales@vivebio.cn` only** via [Resend](https://resend.com).

Customer email is never used as a recipient.

## Prerequisites (Shi must provide)

1. **Resend account** + API key (`re_...`)
2. **Domain verification** on Resend for `vivebio.cn` (or a subdomain), and a verified **From** address such as `orders@vivebio.cn` or `sales@vivebio.cn`
3. Cloudflare account (free tier is enough) + Wrangler login

No Resend / SendGrid / Formspree keys were present in the agent environment at implement time, so this Worker is committed but **not** deployed with a live secret.

## Deploy

```bash
cd email-worker
npm install
npx wrangler login
npx wrangler secret put RESEND_API_KEY   # paste re_...
# optional overrides:
# npx wrangler secret put / vars in dashboard: FROM_EMAIL, SALES_TO, ALLOWED_ORIGINS
npm run deploy
```

Copy the printed Worker URL, e.g. `https://lanwei-order-email.<account>.workers.dev`.

## Wire the order page

In repo-root `index.html`:

```js
window.LANWEI_ORDER_EMAIL_ENDPOINT = 'https://lanwei-order-email.<account>.workers.dev';
```

Commit & push so GitHub Pages / `order.vivebio.cn` picks it up.

## Request shape (POST JSON)

| Field | Notes |
|-------|--------|
| `to` | Ignored for routing; Worker always sends to `SALES_TO` (`sales@vivebio.cn`) |
| `subject` | Email subject |
| `body` | Plain-text order summary |
| `order` | Metadata object |
| `contract_html` / `packing_html` | Full HTML documents |
| `contract_pdf` / `packing_pdf` | Base64 of HTML (or PDF if client adds PDF later) |
| `contract_filename` / `packing_filename` | Attachment names |

Response: `{ "ok": true, "id": "...", "to": "sales@vivebio.cn" }`

## Allowed Origins

Default allow-list includes:

- `https://shidimeng1983.github.io`
- `https://order.vivebio.cn`
- `http://localhost:8080` / `127.0.0.1` (common local ports)

Extend via `ALLOWED_ORIGINS` var (comma-separated) in `wrangler.toml` or the Cloudflare dashboard.
