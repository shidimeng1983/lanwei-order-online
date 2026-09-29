# 览微生物 · 在线下单（客户远程订购页）

面向客户的 TSA 荧光试剂盒在线目录与订购确认页。选购产品、填写单位与收货信息后提交，生成带公章的订购确认合同与配货单；可通过邮件网关发送至 `sales@vivebio.cn`（及可选客户邮箱）。

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
3. 填写必填项：单位名称、联系人、手机、电子邮箱、收货地址；发票与备注选填。
4. 点击 **提交订单**。
5. 成功后可 **下载/打印合同**、**下载/打印配货单**（浏览器打印对话框中选择「存储为 PDF」），或导出配货 CSV。

> 说明：合同 PDF 优先使用浏览器原生打印（避免 html2canvas 中文乱码/空白）。公章叠加在「乙方签字盖章」区域。

## 邮件网关（`LANWEI_ORDER_EMAIL_ENDPOINT`）

在 `index.html` 脚本顶部：

```js
window.LANWEI_ORDER_EMAIL_ENDPOINT = ''; // 填入 Worker / Apps Script / Formspree 等 URL
```

- **已配置**：提交时 `POST` JSON 至该 URL，字段包括：
  - `to_sales`（默认 `sales@vivebio.cn`）
  - `to_customer`（客户勾选回传时）
  - `subject_sales` / `subject_customer`
  - `body_sales` / `body_customer`
  - `order`（单位与明细）
  - `contract_html` / `packing_html`
- **未配置**：仍生成本地合同与配货单；自动下载配货 CSV；并尝试打开 `mailto:sales@vivebio.cn` 发送纯文本摘要（**不含附件**）。成功提示中会注明需配置网关。

可用 Cloudflare Worker、Google Apps Script、Formspree 等实现收件与附件转发；销售收件地址：`sales@vivebio.cn`。

销售邮件主题示例：`【览微在线下单】{单位名称} · {日期}`  
客户邮件主题：`【览微】订购确认文件（待双方确认）`

## 管理员功能

默认隐藏产品 CSV 导入/导出。在 URL 加 `?admin=1` 可显示：

- 导入 / 导出产品目录 CSV
- 客户历史记录
- 「一键输出」

## GitHub Pages 部署

1. 将本目录（至少 `index.html`；可选 `README.md`、`products.csv`、`seal.png`）推送到仓库，例如 `docs/` 或单独 repo 根目录。
2. 仓库 Settings → Pages → Source 选对应分支与目录。
3. 站点根路径即打开 `index.html`。
4. 部署后如需发信，将 `LANWEI_ORDER_EMAIL_ENDPOINT` 改为线上网关 URL 后重新发布。

**请勿**在未配置网关时依赖真实发信；本页不会自行连接 SMTP。

## 公章

- `seal.png`：览微生物官方公章（透明底）。
- `seal.b64.txt`：上述 PNG 的 base64（无换行），构建时写入 `SEAL_PNG_BASE64`。
- 运行时合同 HTML 使用内嵌 base64 的 `<img class="seal-overlay">` 绝对定位叠加，打印时一并输出。

## 文件

| 文件 | 说明 |
|------|------|
| `index.html` | 单页应用（目录、购物车、染料选择、合同/配货单、邮件骨架） |
| `seal.png` | 公章原图 |
| `seal.b64.txt` | 公章 base64 |
| `products.csv` | 产品目录参考 |
| `README.md` | 本说明 |

## 合规与文案要点

- 页头、成功提示、合同页眉/页脚均含 RUO 与「提交不等于自动成交」说明。
- 订货确认条款已弱化为「变更请与览微确认后调整」，不再使用「合同生效后不得取消」硬性表述。
