import { NotFoundException } from '@nestjs/common';
import {
  amountInWords,
  financialYear,
  formatInvoiceNumber,
  gstBreakup,
  rupeesInWords,
} from './invoice.util';
import { InvoiceService } from './invoice.service';
import { PrismaService } from '../prisma/prisma.service';

describe('invoice utils', () => {
  it('splits ₹1000 into taxable value + CGST 9% + SGST 9% with round-off', () => {
    expect(gstBreakup(100000)).toEqual({
      advertising: 0,
      techSupport: 84746,
      cgst: 7627,
      sgst: 7627,
      roundOff: 0,
      total: 100000,
    });
  });

  it('always adds up to the amount paid (round-off absorbs paise differences)', () => {
    for (const total of [150000, 500000, 99900, 123456, 100]) {
      const b = gstBreakup(total);
      expect(b.advertising + b.techSupport + b.cgst + b.sgst + b.roundOff).toBe(total);
      expect(Math.abs(b.roundOff)).toBeLessThanOrEqual(2);
    }
  });

  it('uses the Indian financial year in IST (April–March)', () => {
    expect(financialYear(new Date('2026-03-31T18:00:00Z'))).toBe('25-26'); // 31 Mar 23:30 IST
    expect(financialYear(new Date('2026-03-31T18:31:00Z'))).toBe('26-27'); // 1 Apr 00:01 IST
    expect(financialYear(new Date('2026-10-30T05:00:00Z'))).toBe('26-27');
    expect(financialYear(new Date('2099-12-31T00:00:00Z'))).toBe('99-00');
  });

  it('formats a running invoice number', () => {
    expect(formatInvoiceNumber('25-26', 1)).toBe('VcPro/25-26/0001');
    expect(formatInvoiceNumber('25-26', 12345)).toBe('VcPro/25-26/12345');
  });

  it('writes amounts in Indian-system words', () => {
    expect(rupeesInWords(1000)).toBe('One Thousand');
    expect(rupeesInWords(1500)).toBe('One Thousand Five Hundred');
    expect(rupeesInWords(5000)).toBe('Five Thousand');
    expect(rupeesInWords(118)).toBe('One Hundred Eighteen');
    expect(rupeesInWords(250075)).toBe('Two Lakh Fifty Thousand Seventy Five');
    expect(rupeesInWords(12000000)).toBe('One Crore Twenty Lakh');
    expect(amountInWords(100000)).toBe('Rupees One Thousand Only');
    expect(amountInWords(100050)).toBe('Rupees One Thousand and Fifty Paise Only');
  });
});

describe('InvoiceService', () => {
  const prisma = {
    profile: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    invoiceCounter: { upsert: jest.fn() },
  };
  const service = new InvoiceService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('assignNumber — takes the next serial of the payment date’s financial year', async () => {
    prisma.payment.findUnique.mockResolvedValue({ invoiceNumber: null });
    prisma.invoiceCounter.upsert.mockResolvedValue({ seq: 7 });
    const paidAt = new Date('2026-05-10T10:00:00Z');

    await expect(service.assignNumber('pay1', paidAt)).resolves.toBe('VcPro/26-27/0007');
    expect(prisma.invoiceCounter.upsert.mock.calls[0][0]).toMatchObject({
      where: { financialYear: '26-27' },
      update: { seq: { increment: 1 } },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay1' },
      data: { invoiceNumber: 'VcPro/26-27/0007', invoiceDate: paidAt },
    });
  });

  it('assignNumber — never renumbers an existing invoice', async () => {
    prisma.payment.findUnique.mockResolvedValue({ invoiceNumber: 'VcPro/26-27/0003' });
    await expect(service.assignNumber('pay1', new Date())).resolves.toBe('VcPro/26-27/0003');
    expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
  });

  it('getForUser — 404 until paid; then returns the invoice', async () => {
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1', name: 'SUNSTREAM GLOBAL TECHNOLOGIES' });
    prisma.payment.findFirst.mockResolvedValueOnce(null);
    await expect(service.getForUser('u1')).rejects.toThrow(NotFoundException);

    const paidAt = new Date('2026-10-30T05:00:00Z');
    prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'pay1',
      amount: 100000,
      currency: 'INR',
      razorpayOrderId: 'order_OZ9',
      razorpayPaymentId: 'pay_X',
      paidAt,
      invoiceNumber: 'VcPro/26-27/0001',
      invoiceDate: paidAt,
    });
    const inv = await service.getForUser('u1');
    expect(inv).toMatchObject({
      invoiceNumber: 'VcPro/26-27/0001',
      orderId: 'order_OZ9',
      recipient: 'SUNSTREAM GLOBAL TECHNOLOGIES',
      amountInWords: 'Rupees One Thousand Only',
      seller: { gstin: '29AERPV7005H3ZU' },
    });
    expect(inv.amounts.total).toBe(100000);
  });
});
