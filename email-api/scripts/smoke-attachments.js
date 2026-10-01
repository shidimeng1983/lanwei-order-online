'use strict';
/**
 * Local unit-check of attachment branches (no SMTP).
 * Usage: node scripts/smoke-attachments.js
 */
const assert = require('assert');
const { buildMailAttachments, isPdfBase64 } = require('../server.js');

const tinyPdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'utf8'
).toString('base64');

assert.strictEqual(isPdfBase64(tinyPdf), true);
assert.strictEqual(isPdfBase64('PGh0bWw+'), false); // <html

const pdfAtts = buildMailAttachments({
  order: { name: '测试客户' },
  contract_pdf: tinyPdf,
  contract_filename: '订购合同_测试客户_20261001.pdf',
  contract_content_type: 'application/pdf',
  packing_html: '<div>packing</div>',
  packing_filename: '配货单_测试客户_20261001.html',
});
assert.strictEqual(pdfAtts.length, 2);
assert.ok(pdfAtts[0].filename.endsWith('.pdf'));
assert.strictEqual(pdfAtts[0].contentType, 'application/pdf');
assert.ok(Buffer.isBuffer(pdfAtts[0].content));
assert.ok(pdfAtts[0].content.slice(0, 4).toString() === '%PDF');
assert.ok(pdfAtts[1].filename.endsWith('.html'));
assert.strictEqual(pdfAtts[1].contentType, 'text/html; charset=utf-8');

const htmlLegacy = buildMailAttachments({
  order: { name: '旧版' },
  contract_pdf: Buffer.from('<html><body>合同</body></html>', 'utf8').toString('base64'),
  contract_filename: '订购确认_旧版.html',
  packing_pdf: Buffer.from('<div>配</div>', 'utf8').toString('base64'),
  packing_filename: '配货单_旧版.html',
});
assert.strictEqual(htmlLegacy.length, 2);
assert.ok(htmlLegacy[0].filename.endsWith('.html'));
assert.strictEqual(htmlLegacy[0].contentType, 'text/html; charset=utf-8');

const csvAtts = buildMailAttachments({
  order: { name: 'CSV客' },
  contract_html: '<html>c</html>',
  packing_csv: '货号,数量\nA001,2\n',
  packing_filename: '配货单_CSV客.csv',
});
assert.strictEqual(csvAtts.length, 2);
assert.ok(csvAtts[1].filename.endsWith('.csv'));
assert.strictEqual(csvAtts[1].contentType, 'text/csv; charset=utf-8');
assert.ok(String(csvAtts[1].content).includes('货号'));

const csvB64 = buildMailAttachments({
  order: { name: 'B64' },
  contract_pdf: tinyPdf,
  contract_filename: '订购合同_B64.pdf',
  packing_csv: Buffer.from('a,b\n1,2\n', 'utf8').toString('base64'),
  packing_filename: '配货单_B64.csv',
});
assert.ok(csvB64.some((a) => a.contentType === 'application/pdf'));
assert.ok(csvB64.some((a) => a.contentType === 'text/csv; charset=utf-8'));

console.log('smoke-attachments: OK', {
  pdf: pdfAtts.map((a) => a.filename + '|' + a.contentType),
  htmlLegacy: htmlLegacy.map((a) => a.filename + '|' + a.contentType),
  csv: csvAtts.map((a) => a.filename + '|' + a.contentType),
});
