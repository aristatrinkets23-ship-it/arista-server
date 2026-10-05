import PDFDocument from 'pdfkit';
import { AllStoreSettings } from './storeSettings.service';

export interface InvoiceItem {
  product_name: string;
  metal_type?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  hsn_code?: string;
}

export interface InvoiceOrderData {
  order_number: string;
  invoice_number?: string;
  created_at: string | Date;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  subtotal: number;
  shipping_fee: number;
  tax: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  tracking_code?: string;
  items: InvoiceItem[];
}

/**
 * Converts a number to Indian English words (for amount-in-words line)
 */
const numberToWordsIndian = (num: number): string => {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  const cvt2 = (v: number): string => {
    if (v < 20) return a[v];
    const t = b[Math.floor(v / 10)];
    const u = a[v % 10];
    return u ? `${t} ${u}` : t;
  };
  const cvt3 = (v: number): string => {
    const h = Math.floor(v / 100);
    const r = v % 100;
    let s = '';
    if (h > 0) s += `${a[h]} Hundred `;
    if (r > 0) s += cvt2(r);
    return s.trim();
  };

  let words = '';
  const crore    = Math.floor(n / 10000000);
  let rem        = n % 10000000;
  const lakh     = Math.floor(rem / 100000);
  rem            = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem            = rem % 1000;

  if (crore    > 0) words += `${cvt3(crore)} Crore `;
  if (lakh     > 0) words += `${cvt2(lakh)} Lakh `;
  if (thousand > 0) words += `${cvt2(thousand)} Thousand `;
  if (rem      > 0) words += cvt3(rem);

  return `${words.trim()} Rupees Only`;
};

const fmtRs = (n: number) =>
  'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generates an elegant, professional A4 Tax Invoice PDF and writes it to a Writable stream (e.g. Express Response).
 * Features atelier branding, gold accents, clean cards, and strict coordinate grids with ZERO text overlap.
 */
export const generateInvoicePdf = (
  order: InvoiceOrderData,
  settings: AllStoreSettings,
  outputStream: NodeJS.WritableStream
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `Tax Invoice - ${order.invoice_number || order.order_number}`,
          Author: settings.companyName || 'Arista Trinkets Atelier',
          Subject: `Tax Invoice for Order ${order.order_number}`
        }
      });

      doc.on('error', (err) => reject(err));
      outputStream.on('finish', () => resolve());
      outputStream.on('error', (err) => reject(err));

      doc.pipe(outputStream);

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2); // 523.28

      // Atelier Refined Palette
      const cMocha     = '#382A1F';
      const cGold      = '#B8860B';
      const cLightGold = '#C5A059';
      const cText      = '#2C221E';
      const cMuted     = '#6B5E55';
      const cBorder    = '#DDD4C8';
      const cLightBg   = '#FAF7F2';
      const cGreen     = '#2E7D32';

      // 1. Top Decorative Brand Bar
      doc.rect(margin, margin, contentWidth, 4).fill(cGold);

      let curY = margin + 14;

      // 2. Header: Company Brand on Left, Tax Invoice Title on Right
      doc.font('Helvetica-Bold')
         .fontSize(18)
         .fillColor(cMocha)
         .text((settings.companyName || 'ARISTA TRINKETS ATELIER').toUpperCase(), margin, curY);

      doc.font('Helvetica-Bold')
         .fontSize(15)
         .fillColor(cGold)
         .text('TAX INVOICE', margin, curY, { align: 'right', width: contentWidth });

      curY += 22;

      // Left Column: Company Details & GSTIN
      const leftW = 280;
      doc.font('Helvetica')
         .fontSize(8.5)
         .fillColor(cMuted)
         .text('Demi-Fine Jewellery & Artisanal Keepsakes', margin, curY)
         .text(settings.companyAddress || 'Atelier Suite 402, Heritage Diamond District, Surat, Gujarat 395003', margin, curY + 12, { width: leftW })
         .text(`Phone: ${settings.companyPhone || '+91 90161 34899'}  |  Email: ${settings.companyEmail || 'concierge@aristatrinkets.com'}`, margin, curY + 34, { width: leftW });

      doc.font('Helvetica-Bold')
         .fontSize(8.5)
         .fillColor(cMocha)
         .text('GSTIN: ', margin, curY + 48, { continued: true })
         .fillColor(cGold)
         .text(settings.gstNumber || '24AAACA1234A1Z4');

      // Right Column: Invoice Meta Details (Fixed two-column key-value grid - ZERO OVERLAP)
      const rightX = margin + 295;
      const rightW = contentWidth - 295; // 228.28 pt
      const lblW   = 75;
      const valX   = rightX + lblW;
      const valW   = rightW - lblW;

      const invoiceNumber = order.invoice_number
        || `INV-${new Date(order.created_at || Date.now()).getFullYear()}-${String(order.order_number).replace(/\D/g, '').padStart(6, '0')}`;
      const invoiceDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      const payMethod = order.payment_method === 'RAZORPAY' ? 'Online / Razorpay' : (order.payment_method || 'Cash On Delivery');
      const payStatus = (order.payment_status === 'PAID') ? 'PAID' : (order.payment_status || 'PENDING');

      const metaRows: { label: string; value: string; boldVal?: boolean; valColor?: string }[] = [
        { label: 'Invoice No:', value: invoiceNumber, boldVal: true, valColor: cMocha },
        { label: 'Order No:', value: order.order_number, boldVal: true, valColor: cMocha },
        { label: 'Invoice Date:', value: invoiceDate, boldVal: false, valColor: cText },
        { label: 'Payment Mode:', value: payMethod, boldVal: false, valColor: cText },
        { label: 'Payment Status:', value: payStatus, boldVal: true, valColor: payStatus === 'PAID' ? cGreen : cGold }
      ];

      if (order.tracking_code) {
        metaRows.push({ label: 'AWB / Track:', value: order.tracking_code, boldVal: true, valColor: cGold });
      }

      let mY = curY;
      for (const row of metaRows) {
        doc.font('Helvetica')
           .fontSize(8.5)
           .fillColor(cMuted)
           .text(row.label, rightX, mY, { width: lblW, align: 'left' });

        doc.font(row.boldVal ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(8.5)
           .fillColor(row.valColor || cText)
           .text(row.value, valX, mY, { width: valW, align: 'right' });

        mY += 13;
      }

      curY = Math.max(curY + 64, mY) + 6;

      // Thin separator rule
      doc.strokeColor(cBorder).lineWidth(0.5).moveTo(margin, curY).lineTo(margin + contentWidth, curY).stroke();
      curY += 10;

      // 3. Billing & Shipping Address Panels (Two Cards)
      const colW  = (contentWidth - 14) / 2;
      const cardH = 75;

      // Left Card: Billed To / Buyer Details
      doc.rect(margin, curY, colW, cardH).fillAndStroke(cLightBg, cBorder);
      doc.font('Helvetica-Bold')
         .fontSize(8)
         .fillColor(cGold)
         .text('BILLED TO / BUYER DETAILS', margin + 10, curY + 8);

      doc.font('Helvetica-Bold')
         .fontSize(9)
         .fillColor(cMocha)
         .text(order.customer_name || 'Valued Customer', margin + 10, curY + 22, { width: colW - 20 });

      doc.font('Helvetica')
         .fontSize(8)
         .fillColor(cMuted)
         .text(`Phone: ${order.customer_phone || 'N/A'}`, margin + 10, curY + 36, { width: colW - 20 })
         .text(`Email: ${order.customer_email || 'N/A'}`, margin + 10, curY + 48, { width: colW - 20 })
         .text(`Place of Supply: ${order.state || 'Gujarat'} (State Code)`, margin + 10, curY + 60, { width: colW - 20 });

      // Right Card: Delivered & Shipped To
      const rightColX = margin + colW + 14;
      doc.rect(rightColX, curY, colW, cardH).fillAndStroke(cLightBg, cBorder);
      doc.font('Helvetica-Bold')
         .fontSize(8)
         .fillColor(cGold)
         .text('DELIVERED & SHIPPED TO', rightColX + 10, curY + 8);

      doc.font('Helvetica-Bold')
         .fontSize(9)
         .fillColor(cMocha)
         .text(order.customer_name || 'Valued Customer', rightColX + 10, curY + 22, { width: colW - 20 });

      const fullAddr = [
        order.shipping_address,
        order.city,
        order.state ? `${order.state}${order.pincode ? ' - ' + order.pincode : ''}` : order.pincode
      ].filter(Boolean).join(', ');

      doc.font('Helvetica')
         .fontSize(8)
         .fillColor(cMuted)
         .text(fullAddr, rightColX + 10, curY + 36, { width: colW - 20, height: 26, lineGap: 2 });

      doc.font('Helvetica')
         .fontSize(8)
         .fillColor(cMuted)
         .text(`Phone: ${order.customer_phone || 'N/A'}`, rightColX + 10, curY + 60, { width: colW - 20 });

      curY += cardH + 12;

      // 4. Line Items Table
      // Column widths: # (24), Description (215), HSN (50), Qty (35), Unit Price (95), Amount (104) = 523
      const c0  = margin;
      const c1  = c0 + 24;
      const c2  = c1 + 215;
      const c3  = c2 + 50;
      const c4  = c3 + 35;
      const c5  = c4 + 95;
      const thH = 20;

      // Header row background
      doc.rect(margin, curY, contentWidth, thH).fill(cMocha);

      doc.font('Helvetica-Bold')
         .fontSize(7.5)
         .fillColor('#FFFFFF')
         .text('#', c0 + 2, curY + 6, { width: 20, align: 'center' })
         .text('DESCRIPTION OF GOODS', c1 + 6, curY + 6, { width: 205 })
         .text('HSN/SAC', c2, curY + 6, { width: 50, align: 'center' })
         .text('QTY', c3, curY + 6, { width: 35, align: 'center' })
         .text('UNIT PRICE (Rs.)', c4, curY + 6, { width: 90, align: 'right' })
         .text('AMOUNT (Rs.)', c5, curY + 6, { width: 99, align: 'right' });

      curY += thH;

      const items = (Array.isArray(order.items) && order.items.length > 0)
        ? order.items
        : [{
            product_name: 'Demi-Fine Jewellery Piece',
            metal_type: '18K Warm Gold',
            quantity: 1,
            unit_price: Number(order.subtotal) || Number(order.total_amount) || 0,
            total_price: Number(order.subtotal) || Number(order.total_amount) || 0,
            hsn_code: '7117'
          }];

      items.forEach((item, idx) => {
        const rowH = 24;
        if (idx % 2 === 1) {
          doc.rect(margin, curY, contentWidth, rowH).fill('#FAF8F5');
        }

        doc.strokeColor(cBorder).lineWidth(0.3).moveTo(margin, curY + rowH).lineTo(margin + contentWidth, curY + rowH).stroke();

        const unitP = Number(item.unit_price) || 0;
        const qty   = Number(item.quantity)   || 1;
        const totP  = Number(item.total_price) || (unitP * qty);
        const metal = item.metal_type ? ` [${item.metal_type}]` : '';

        doc.font('Helvetica')
           .fontSize(8)
           .fillColor(cText)
           .text(String(idx + 1), c0 + 2, curY + 7, { width: 20, align: 'center' });

        doc.font('Helvetica-Bold')
           .fontSize(8)
           .fillColor(cMocha)
           .text(item.product_name, c1 + 6, curY + 4, { width: 205, continued: true })
           .font('Helvetica')
           .fontSize(7.5)
           .fillColor(cMuted)
           .text(metal);

        doc.font('Helvetica')
           .fontSize(8)
           .fillColor(cMuted)
           .text(item.hsn_code || '7117', c2, curY + 7, { width: 50, align: 'center' })
           .text(String(qty), c3, curY + 7, { width: 35, align: 'center' });

        doc.font('Helvetica')
           .fontSize(8)
           .fillColor(cText)
           .text(unitP.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), c4, curY + 7, { width: 90, align: 'right' });

        doc.font('Helvetica-Bold')
           .fontSize(8)
           .fillColor(cMocha)
           .text(totP.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), c5, curY + 7, { width: 99, align: 'right' });

        curY += rowH;
      });

      // Bottom border of table
      doc.strokeColor(cBorder).lineWidth(0.5).moveTo(margin, curY).lineTo(margin + contentWidth, curY).stroke();
      curY += 10;

      // 5. Amount in Words (Left) and Price Summary (Right)
      const summaryW = 230;
      const summaryX = margin + contentWidth - summaryW;
      const wordsW   = contentWidth - summaryW - 14;

      const subtotal    = Number(order.subtotal)     || 0;
      const shippingFee = Number(order.shipping_fee) || 0;
      const tax         = Number(order.tax)          || 0;
      const totalAmount = Number(order.total_amount)  || (subtotal + shippingFee + tax);

      const isGujarat = (order.state || '').trim().toLowerCase().includes('gujarat');
      const gstRate   = Number(settings.gstPercentage) || 3.0;

      // Words card on left
      const wordsBoxH = 75;
      doc.rect(margin, curY, wordsW, wordsBoxH).fillAndStroke(cLightBg, cBorder);
      doc.font('Helvetica-Bold')
         .fontSize(8)
         .fillColor(cGold)
         .text('INVOICE AMOUNT IN WORDS:', margin + 10, curY + 10);

      doc.font('Helvetica-Bold')
         .fontSize(8.5)
         .fillColor(cMocha)
         .text(numberToWordsIndian(totalAmount), margin + 10, curY + 24, { width: wordsW - 20, lineGap: 3 });

      doc.font('Helvetica')
         .fontSize(7.5)
         .fillColor(cMuted)
         .text('• Genuine demi-fine craftsmanship with anti-tarnish protective sealing.', margin + 10, curY + 54);

      // Summary on right
      let sY = curY;
      const drawSumRow = (label: string, valStr: string, isBold = false, isTotal = false) => {
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(isTotal ? 9.5 : 8)
           .fillColor(isTotal ? cGold : (isBold ? cMocha : cMuted))
           .text(label, summaryX, sY, { width: 130, align: 'left' });

        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(isTotal ? 9.5 : 8)
           .fillColor(isTotal ? cMocha : (isBold ? cMocha : cText))
           .text(valStr, summaryX + 130, sY, { width: summaryW - 130, align: 'right' });

        sY += isTotal ? 16 : 13;
      };

      drawSumRow('Items Subtotal:', fmtRs(subtotal));
      drawSumRow('Delivery & Insurance:', shippingFee === 0 ? 'FREE' : fmtRs(shippingFee));

      if (isGujarat) {
        const halfRate = (gstRate / 2).toFixed(1);
        const halfTax  = tax / 2;
        drawSumRow(`CGST (${halfRate}%):`, fmtRs(halfTax));
        drawSumRow(`SGST (${halfRate}%):`, fmtRs(halfTax));
      } else {
        drawSumRow(`IGST (${gstRate}%):`, fmtRs(tax));
      }

      // Divider line before total
      doc.strokeColor(cMocha).lineWidth(0.8).moveTo(summaryX, sY + 2).lineTo(summaryX + summaryW, sY + 2).stroke();
      sY += 6;

      drawSumRow('TOTAL AMOUNT:', fmtRs(totalAmount), true, true);

      // Double line under total
      doc.strokeColor(cGold).lineWidth(1.2).moveTo(summaryX, sY).lineTo(summaryX + summaryW, sY).stroke();

      curY = Math.max(curY + wordsBoxH, sY) + 14;

      // 6. Terms & Atelier Care (Left) and Signatory (Right)
      const boxW    = (contentWidth - 14) / 2;
      const termsW  = boxW - 20;

      const termsList = [
        '1. Goods once sold are covered under Arista 30-Day Quality Assurance.',
        '2. Keep jewellery away from direct perfume, moisture and harsh chemicals.',
        `3. Queries & concierge: ${settings.companyEmail || 'concierge@aristatrinkets.com'}`,
        '4. Jurisdiction for disputes: Surat, Gujarat, India.'
      ];

      doc.font('Helvetica').fontSize(7.2);
      let calculatedTermsH = 22;
      const termHeights: number[] = [];
      for (const term of termsList) {
        const th = doc.heightOfString(term, { width: termsW, lineGap: 1.5 });
        termHeights.push(th);
        calculatedTermsH += th + 3.5;
      }
      calculatedTermsH += 4;

      const bottomH = Math.max(88, Math.ceil(calculatedTermsH));

      // Left Box: Terms
      doc.rect(margin, curY, boxW, bottomH).fillAndStroke(cLightBg, cBorder);
      doc.font('Helvetica-Bold')
         .fontSize(8)
         .fillColor(cGold)
         .text('TERMS & ATELIER CARE', margin + 10, curY + 8);

      let termY = curY + 22;
      doc.font('Helvetica')
         .fontSize(7.2)
         .fillColor(cMuted);

      for (let i = 0; i < termsList.length; i++) {
        doc.text(termsList[i], margin + 10, termY, { width: termsW, lineGap: 1.5 });
        termY += termHeights[i] + 3.5;
      }

      // Right Box: Signatory
      const signX = margin + boxW + 14;
      doc.rect(signX, curY, boxW, bottomH).stroke(cBorder);

      doc.font('Helvetica-Bold')
         .fontSize(8)
         .fillColor(cMocha)
         .text(`For ${settings.companyName || 'ARISTA TRINKETS ATELIER'}`, signX + 10, curY + 8, { width: boxW - 20, align: 'right' });

      doc.font('Helvetica-Oblique')
         .fontSize(11)
         .fillColor(cLightGold)
         .text('Arista Atelier Authenticated', signX + 10, curY + (bottomH - 46), { width: boxW - 20, align: 'right' });

      doc.strokeColor(cBorder).lineWidth(0.5).moveTo(signX + boxW - 130, curY + bottomH - 24).lineTo(signX + boxW - 10, curY + bottomH - 24).stroke();

      doc.font('Helvetica')
         .fontSize(7.5)
         .fillColor(cMuted)
         .text('Authorized Signatory / Seal', signX + 10, curY + bottomH - 18, { width: boxW - 20, align: 'right' });

      // 7. Footer at very bottom
      const footerY = pageHeight - margin - 12;
      doc.strokeColor(cBorder).lineWidth(0.5).moveTo(margin, footerY - 4).lineTo(margin + contentWidth, footerY - 4).stroke();

      doc.font('Helvetica')
         .fontSize(6.5)
         .fillColor(cMuted)
         .text(
           'This is a computer-generated tax invoice issued in accordance with the Central Goods and Services Tax Act, 2017. No physical signature is required.',
           margin,
           footerY,
           { width: contentWidth, align: 'center' }
         );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
