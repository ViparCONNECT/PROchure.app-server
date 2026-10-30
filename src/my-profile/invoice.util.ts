/** Seller details printed on every GST invoice. */
export const INVOICE_SELLER = {
  name: 'Vipar ®',
  addressLines: [
    '# 103, 2nd Floor',
    '2023/A, Jeevanbheema Nagar',
    '14th Main, HAL 2nd Stage',
    'Indiranagar, Bangalore',
    'Pin code : 560038',
  ],
  gstin: '29AERPV7005H3ZU',
};

export const INVOICE_PREFIX = 'VcPro';
const GST_RATE = 0.18;
const HALF_RATE = GST_RATE / 2;

export interface GstBreakup {
  /** All amounts in paise */
  advertising: number;
  techSupport: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  total: number;
}

/** Splits a GST-inclusive total (paise) into taxable value + CGST 9% + SGST 9% + round-off. */
export function gstBreakup(totalPaise: number): GstBreakup {
  const techSupport = Math.round(totalPaise / (1 + GST_RATE));
  const cgst = Math.round(techSupport * HALF_RATE);
  const sgst = cgst;
  return {
    advertising: 0,
    techSupport,
    cgst,
    sgst,
    roundOff: totalPaise - techSupport - cgst - sgst,
    total: totalPaise,
  };
}

/** Indian financial year (April–March, IST) as "25-26". */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const formatInvoiceNumber = (fy: string, seq: number) =>
  `${INVOICE_PREFIX}/${fy}/${String(seq).padStart(4, '0')}`;

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** Whole rupees in Indian-system words, e.g. 1500 → "One Thousand Five Hundred". */
export function rupeesInWords(rupees: number): string {
  let n = Math.floor(rupees);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  for (const [unit, size] of [
    ['Crore', 1e7],
    ['Lakh', 1e5],
    ['Thousand', 1e3],
  ] as const) {
    if (n >= size) {
      parts.push(`${rupeesInWords(Math.floor(n / size))} ${unit}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(' ');
}

/** "Rupees One Thousand Only" / "Rupees One Thousand and Fifty Paise Only" */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${rupeesInWords(rupees)}${p ? ` and ${below1000(p)} Paise` : ''} Only`;
}
