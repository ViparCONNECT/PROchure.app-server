import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_SELLER,
  amountInWords,
  financialYear,
  formatInvoiceNumber,
  gstBreakup,
} from './invoice.util';

type Tx = Prisma.TransactionClient | PrismaService;

/** GST invoices for paid listing fees. Numbers are a running serial per financial year. */
@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Assigns the next invoice number to a paid payment (no-op if it already has one). */
  async assignNumber(paymentId: string, paidAt: Date, tx: Tx = this.prisma): Promise<string> {
    const existing = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { invoiceNumber: true },
    });
    if (existing?.invoiceNumber) return existing.invoiceNumber;

    const fy = financialYear(paidAt);
    const counter = await tx.invoiceCounter.upsert({
      where: { financialYear: fy },
      create: { financialYear: fy, seq: 1 },
      update: { seq: { increment: 1 } },
    });
    const invoiceNumber = formatInvoiceNumber(fy, counter.seq);
    await tx.payment.update({
      where: { id: paymentId },
      data: { invoiceNumber, invoiceDate: paidAt },
    });
    return invoiceNumber;
  }

  /** Invoice for the logged-in user's profile; 404 until the fee is paid. */
  async getForUser(userId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { userId },
      select: { id: true, name: true },
    });
    if (!profile) throw new NotFoundException('You have not created a profile yet');

    const payment = await this.prisma.payment.findFirst({
      where: { profileId: profile.id, status: PaymentStatus.PAID },
      orderBy: { paidAt: 'desc' },
    });
    if (!payment)
      throw new NotFoundException(
        'No paid subscription found — the invoice is available after payment.',
      );

    const paidAt = payment.paidAt ?? payment.updatedAt;
    const invoiceNumber = payment.invoiceNumber ?? (await this.assignNumber(payment.id, paidAt));

    return {
      invoiceNumber,
      invoiceDate: payment.invoiceDate ?? paidAt,
      orderId: payment.razorpayOrderId,
      paymentId: payment.razorpayPaymentId,
      currency: payment.currency,
      seller: INVOICE_SELLER,
      recipient: profile.name,
      profileDisplayChoice: 'Classic-PRO e-visiting card',
      amounts: gstBreakup(payment.amount),
      amountInWords: amountInWords(payment.amount),
    };
  }
}
