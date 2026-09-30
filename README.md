# 览微生物 · 在线下单（客户远程订购页）

面向客户的 TSA 荧光试剂盒在线目录与订购确认页。选购产品、填写单位与收货信息后提交，生成带公章的订购确认合同与配货单；经邮件网关将附件发送至 **`sales@vivebio.cn`（订单部）**。**不会向客户邮箱发信**——订单部线下与客户确认并收款后，再转发配货单给仓库。

产品仅供科研使用（RUO），不用于临床诊断。**提交不等于自动成交，以双方确认后的订单为准。**

## 本地打开

1. 用浏览器直接打开本目录下的 `index.html`（双击或拖入 Chrome / Edge / Firefox）。
2. 也可在本目录启动静态服务，例如：
   ```bash
   python3 -m http.server 8080
   ```
   然后访问 `http://localhost:8080/`。
3. 页面使用 Tailwind CDN，首次打开需能访问外网 CDN；公章已内嵌为 base64，不依赖 `seal.png` 运行时加载。

## 客户使用流程

1. 筛选 / 浏览产品，加入购物车（CRT / ERT / FRT 试剂盒会引导选择荧光染料）。
2. 打开购物车 → **填写订购信息**。
3. 填写必填项：单位名称、联系人、手机、收货地址；**电子邮箱为选填**（若填写则校验格式）；发票与备注选填。
4. 点击 **提交订单**。
5. 成功后显示「下单完成，将有客服联系您」与客服微信二维码；请 **下载/打印合同**、**下载/打印配货单**（浏览器打印对话框中选择「存储为 PDF」）留存，或导出配货 CSV。

> 说明：合同 PDF 优先使用浏览器原生打印（避免 html2canvas 中文乱码/空白）。公章叠加在「乙方签字盖章」区域。邮件附件当前以 HTML 文档形式发出（订购确认 / 配货单）；本地仍可打印存 PDF。

## 邮件网关（`LANWEI_ORDER_EMAIL_ENDPOINT`）

在 `index.html` 脚本顶部：

```js
window.LANWEI_ORDER_EMAIL_ENDPOINT = ''; // 填入 Cloudflare Worker URL，见 email-worker/
```

- **已配置**：提交时 `POST` JSON 至该 URL，字段包括：
  - `to`（客户端传 `sales@vivebio.cn`；Worker 强制只发销售）
  - `subject` / `body`（订单摘要）
  - `order`（单位与明细）
  - `contract_html` / `packing_html`（完整 HTML）
  - `contract_pdf` / `packing_pdf`（当前为 HTML 的 base64；命名保留兼容，便于日后换真 PDF）
- **未配置**：仍生成本地合同与配货单；自动下载配货 CSV；**不会**打开 mailto / 系统邮件客户端。成功页提示「下单完成，将有客服联系您」，并展示客服微信二维码（`wechat-qr.png`；未上传时显示占位）。

实现：仓库内 `email-worker/`（Cloudflare Worker + Resend）。收件地址固定 **`sales@vivebio.cn`**，不下发客户。

### 部署邮件网关（需 Shi 提供凭证）

环境中未发现现成 Resend / SendGrid / Formspree API Key。上线发信前请：

1. 在 [Resend](https://resend.com) 注册，验证 **`vivebio.cn`**（或子域），准备发件地址（如 `orders@vivebio.cn`）。
2. 创建 API Key（`re_...`）。
3. 按 `email-worker/README.md`：`wrangler login` → `wrangler secret put RESEND_API_KEY` → `npm run deploy`。
4. 将 Worker URL 写入 `index.html` 的 `LANWEI_ORDER_EMAIL_ENDPOINT`，再推送 Pages。

销售邮件主题示例：`【览微在线下单】{单位名称} · {日期}`

## 管理员功能

默认隐藏产品 CSV 导入/导出。在 URL 加 `?admin=1` 可显示：

- 导入 / 导出产品目录 CSV
- 客户历史记录
- 「一键输出」

## GitHub Pages 部署

1. 将本目录推送到仓库根目录（`shidimeng1983/lanwei-order-online`）。
2. 仓库 Settings → Pages → Source 选 `main` / root。
3. 自定义域：`order.vivebio.cn`（见 `CNAME`）。
4. 部署后如需发信，将 `LANWEI_ORDER_EMAIL_ENDPOINT` 改为线上 Worker URL 后重新发布。

**请勿**在未配置网关时依赖真实发信；本页不会自行连接 SMTP。

## 公章

- `seal.png`：览微生物官方公章（透明底）。
- 运行时合同 HTML 使用内嵌 base64 的 `<img class="seal-overlay">` 绝对定位叠加，打印时一并输出。

## 文件

| 文件 | 说明 |
|------|------|
| `index.html` | 单页应用（目录、购物车、染料选择、合同/配货单、邮件客户端） |
| `email-worker/` | Cloudflare Worker：Resend 发信至 sales@vivebio.cn |
| `wechat-qr.png` | 客服微信二维码（成功页展示；未放入仓库时显示「二维码待上传」占位）。 |
| `seal.png` | 公章原图 |
| `products.csv` | 产品目录参考 |
| `CNAME` | GitHub Pages 自定义域 order.vivebio.cn |
| `README.md` | 本说明 |

## 合规与文案要点

- 页头、成功提示、合同页眉/页脚均含 RUO 与「提交不等于自动成交」说明。
- 订货确认条款已弱化为「变更请与览微确认后调整」，不再使用「合同生效后不得取消」硬性表述。
- 客户邮箱选填；订购确认与配货单只发销售部，不回客户邮箱。
