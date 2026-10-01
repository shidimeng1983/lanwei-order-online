# Lanwei order email API (Aliyun SMTP)

Node + Express + **nodemailer** gateway. Cloudflare Workers cannot open SMTP sockets, so this service runs on any Node host (box + cloudflared tunnel, Railway, Fly, Render, VPS, etc.).

Accepts the same POST JSON as the old Resend worker and emails **订购合同 + 配货单** **only** to `sales@vivebio.cn`.

### Attachments

| Field | Notes |
|-------|--------|
| `contract_pdf` + `contract_filename` ending `.pdf` + `contract_content_type: application/pdf` | Real PDF bytes (base64). Preferred. |
| `contract_html` / legacy HTML in `contract_pdf` | Still accepted as `text/html` fallback. |
| `packing_csv` + `packing_filename` ending `.csv` | Optional UTF-8 or base64 CSV (`text/csv`). |
| `packing_html` / legacy `packing_pdf` HTML | HTML packing attachment when CSV not sent. |

## Secrets (never commit)

| Env | Value |
|-----|--------|
| `ALIYUN_MAIL_SMTP_PASS` | Aliyun enterprise mail **第三方客户端密码** |
| `SMTP_USER` | `order@vivebio.cn` (default) |
| `FROM_EMAIL` | `订单通知 <order@vivebio.cn>` |
| `SALES_TO` | `sales@vivebio.cn` |

SMTP: `smtp.qiye.aliyun.com:465` SSL.

## Local / box

```bash
cd email-api
npm install
# password already in process env, or export ALIYUN_MAIL_SMTP_PASS=...
npm run test-send   # real test to sales@
npm start           # listens :8787
```

Expose HTTPS (example: Cloudflare quick tunnel):

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Set in repo-root `index.html`:

```js
window.LANWEI_ORDER_EMAIL_ENDPOINT = 'https://<your-public-https-host>';
```

## CORS

Allows `order.vivebio.cn`, `shidimeng1983.github.io`, and common localhost ports. Extend via `ALLOWED_ORIGINS`.
