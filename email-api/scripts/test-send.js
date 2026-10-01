'use strict';
/**
 * One-shot SMTP test to sales@vivebio.cn. Does not print the password.
 */
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qiye.aliyun.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'order@vivebio.cn';
const SMTP_PASS = process.env.ALIYUN_MAIL_SMTP_PASS || process.env.SMTP_PASS || '';
const FROM_EMAIL = (process.env.FROM_EMAIL || '订单通知 <order@vivebio.cn>').trim();
const SALES_TO = (process.env.SALES_TO || 'sales@vivebio.cn').trim();

if (!SMTP_PASS) {
  console.error('FAIL: ALIYUN_MAIL_SMTP_PASS missing');
  process.exit(1);
}

(async () => {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  console.log('Verifying SMTP…');
  await transporter.verify();
  console.log('SMTP verify OK');

  const stamp = new Date().toISOString();
  const info = await transporter.sendMail({
    from: FROM_EMAIL,
    to: SALES_TO,
    subject: `【览微邮件网关测试】${stamp}`,
    text: `这是一封自动测试邮件（Aliyun SMTP / nodemailer）。\n时间：${stamp}\nFrom：order@vivebio.cn\nTo：sales@vivebio.cn\n若收到此信，说明下单邮件通道可用。`,
    attachments: [
      {
        filename: 'test-contract.html',
        content:
          '<!DOCTYPE html><html><body><h1>订购确认测试</h1><p>Aliyun SMTP test attachment</p></body></html>',
        contentType: 'text/html; charset=utf-8',
      },
      {
        filename: 'test-packing.html',
        content:
          '<!DOCTYPE html><html><body><h1>配货单测试</h1><p>Aliyun SMTP test attachment</p></body></html>',
        contentType: 'text/html; charset=utf-8',
      },
    ],
  });

  console.log('SENT ok messageId=', info.messageId, 'response=', info.response);
})().catch((err) => {
  console.error('FAIL:', err && err.message ? err.message : err);
  process.exit(1);
});
