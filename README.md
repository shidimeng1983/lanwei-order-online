# 览微生物 · 在线下单（客户远程订购页）

## 视觉（ViveBio v0.3）

客户下单页屏幕 UI 对齐官网暗色荧光 KV（近黑底、青→蓝→紫→品红渐变、玻璃卡片、RUO 顶栏与 Logo）。打印/PDF 合同仍为浅色纸面样式。品牌 Logo：`assets/logo-mark.png`。

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
5. 成功后显示「下单完成，将有客服联系您」「请下载/打印订购确认合同留存」与客服微信二维码（如需联系客服请扫码）。客户仅可 **下载/打印合同**（浏览器打印对话框中选择「存储为 PDF」）。配货单不向客户展示下载按钮，仅随邮件发给订单部。

> 说明：合同 PDF 优先使用浏览器原生打印（避免 html2canvas 中文乱码/空白）。公章叠加在「乙方签字盖章」区域。邮件附件当前以 HTML 文档形式发出（订购确认 / 配货单）；客户本地仅打印合同存 PDF。

## 邮件网关（`LANWEI_ORDER_EMAIL_ENDPOINT`）

在 `index.html` 脚本顶部：

```js
window.LANWEI_ORDER_EMAIL_ENDPOINT = ''; // 填入 email-api 公网 HTTPS，见 email-api/
```

- **已配置**：提交时 `POST` JSON 至该 URL，字段包括：
  - `to`（客户端传 `sales@vivebio.cn`；网关强制只发销售）
  - `subject` / `body`（订单摘要）
  - `order`（单位与明细）
  - `contract_html` / `packing_html`（完整 HTML）
  - `contract_pdf` / `packing_pdf`（当前为 HTML 的 base64；命名保留兼容，便于日后换真 PDF）
- **未配置**：仍生成本地合同与配货单；**不会**打开 mailto / 系统邮件客户端，也**不会**自动下载配货 CSV。成功页提示「下单完成，将有客服联系您」「请下载/打印订购确认合同留存」，并展示客服微信二维码（`wechat-qr.png`；未上传时显示占位）。

实现：**`email-api/`**（Node + Express + **nodemailer** + 阿里云企业邮 SMTP）。Cloudflare Workers 无法建 SMTP 套接字，故不用 Worker 直连 SMTP。收件固定 **`sales@vivebio.cn`**，From **`order@vivebio.cn`**。网关成功时成功页可附「订购确认与配货单已发至订单邮箱」。

旧版 `email-worker/`（Resend）保留作参考，当前主路径为 `email-api/`。

### 部署邮件网关（Aliyun SMTP）

1. 阿里云企业邮管理后台：为 `order@vivebio.cn` **允许第三方客户端**，并开启 SMTP；在网页端生成 **第三方客户端安全密码**。
2. 在运行主机设置环境变量（勿提交仓库）：
   - `ALIYUN_MAIL_SMTP_PASS` = 第三方客户端密码
   - `SMTP_USER=order@vivebio.cn`（默认）
   - `FROM_EMAIL=订单通知 <order@vivebio.cn>`
   - `SALES_TO=sales@vivebio.cn`
3. `cd email-api && npm install && npm run test-send`（应成功发到 sales@）→ `npm start`（默认 `:8787`）。
4. 用 **Railway / Fly / Render / 具名 cloudflared tunnel / VPS** 暴露公网 HTTPS（quick tunnel URL 会变，勿用于生产）。
5. 将 HTTPS 根地址写入 `index.html` 的 `LANWEI_ORDER_EMAIL_ENDPOINT`，推送 Pages。

SMTP：`smtp.qiye.aliyun.com:465` SSL。销售邮件主题示例：`【览微在线下单】{单位名称} · {日期}`

## 管理员功能

默认隐藏产品 CSV 导入/导出。在 URL 加 `?admin=1` 可显示：

- 导入 / 导出产品目录 CSV
- 客户历史记录
- 「一键输出」

## GitHub Pages 部署

1. 将本目录推送到仓库根目录（`shidimeng1983/lanwei-order-online`）。
2. 仓库 Settings → Pages → Source 选 `main` / root。
3. 自定义域：`order.vivebio.cn`（见 `CNAME`）。
4. 部署后如需发信，将 `LANWEI_ORDER_EMAIL_ENDPOINT` 改为线上 `email-api` HTTPS URL 后重新发布。

**请勿**在未配置网关时依赖真实发信；本页不会自行连接 SMTP。

## 公章

- `seal.png`：览微生物官方公章（透明底）。
- 运行时合同 HTML 使用内嵌 base64 的 `<img class="seal-overlay">` 绝对定位叠加，打印时一并输出。

## 文件

| 文件 | 说明 |
|------|------|
| `index.html` | 单页应用（目录、购物车、染料选择、合同/配货单、邮件客户端） |
| `email-api/` | Node 网关：Aliyun SMTP → sales@vivebio.cn |
| `email-worker/` | （旧）Cloudflare Worker + Resend，已弃用为主路径 |
| `wechat-qr.png` | 客服微信二维码（成功页展示；未放入仓库时显示「二维码待上传」占位）。 |
| `seal.png` | 公章原图 |
| `products.csv` | 产品目录参考 |
| `CNAME` | GitHub Pages 自定义域 order.vivebio.cn |
| `README.md` | 本说明 |

## 合规与文案要点

- 页头、成功提示、合同页眉/页脚均含 RUO 与「提交不等于自动成交」说明。
- 订货确认条款已弱化为「变更请与览微确认后调整」，不再使用「合同生效后不得取消」硬性表述。
- 客户邮箱选填；订购确认与配货单只发销售部，不回客户邮箱。
