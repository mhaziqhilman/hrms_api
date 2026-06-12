const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const path = require('path');
const { pathToFileURL } = require('url');
const logger = require('../utils/logger');

// pdfjs-dist v4+ ships ESM only; load lazily via dynamic import for CJS interop.
let _pdfjs = null;
async function getPdfJs() {
  if (!_pdfjs) {
    _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return _pdfjs;
}

// pdfjs validates these as URLs (must start with file://, end with /).
// Native Windows paths (C:\...\cmaps\) fail strict trailing-slash check.
function dirAsFileUrl(dir) {
  return pathToFileURL(dir).href.replace(/\/?$/, '/');
}

let _resourcePaths = null;
function getPdfJsResourcePaths() {
  if (!_resourcePaths) {
    const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
    _resourcePaths = {
      cMapUrl: dirAsFileUrl(path.join(pdfjsDir, 'cmaps')),
      standardFontDataUrl: dirAsFileUrl(path.join(pdfjsDir, 'standard_fonts'))
    };
  }
  return _resourcePaths;
}

// Default provider when the caller doesn't specify. The caller (frontend)
// can override per-request via the `provider` option.
//   "anthropic" — native Anthropic Messages API + native PDF support
//   "qwen" / "openai" / "openai-compat" — OpenAI-compatible vision endpoint
const DEFAULT_PROVIDER = (process.env.INVOICE_EXTRACTION_PROVIDER || 'anthropic').toLowerCase();

const OPENAI_COMPAT_PROVIDERS = new Set(['qwen', 'openai', 'openai-compat']);

// Shared across both providers — single source of truth for invoice extraction rules.
const SYSTEM_PROMPT = `You are an invoice extraction assistant for a Malaysian HRMS that integrates with LHDN MyInvois.

You receive an invoice or purchase order (PDF rendered as images for vision models, or a native PDF) and call the extract_invoice tool/function with structured data. Follow these rules strictly:

GENERAL
- Dates must be in ISO YYYY-MM-DD format. If only a month/year is shown, use the first of the month.
- po_number (header): the Purchase Order reference at the invoice header (labels: "PO Number", "PO No", "PO #", "Order No", "P.O."). If multiple POs are shown joined together (e.g. "PO-001/PO-002"), keep them as-is in this field — the system will split them.
- items[].po_number: if the line-items table has a "PO No" / "PO Number" column with a different PO per row, extract each row's PO into that line's po_number field. Leave empty if all rows share the same header PO.
- commence_date_start / commence_date_end: extract the service/activity period the invoice covers (labels: "Commencement Date", "Service Period", "Billing Period", "Period", "From - To", "Coverage Period", "Service Date"). If shown as a single range like "1 Feb 2025 – 28 Feb 2025", split into start and end. If only a single date, use it for both. Leave empty if not shown.
- Currency defaults to "MYR" unless the document clearly shows another (USD, SGD, EUR, etc.).
- For numeric amounts, return JavaScript numbers (not strings), with reasonable decimal precision.
- If a field is not clearly present, OMIT it or leave it empty — DO NOT GUESS. It is better to leave a field blank than to fabricate.
- Add a note to extraction_notes for every field where you were uncertain, used a default, or noticed something off (faint print, partial OCR, ambiguous total).

MALAYSIAN TAX IDENTIFIERS
- TIN: format starts with C (companies) or IG (individuals), e.g. C1234567890. Sometimes labelled "Tax ID", "Tax No", "GST No" (old).
- BRN: SSM business registration number, e.g. 202001012345 or 12-digit numeric.
- SST No: format varies, often A01-2345-67891012.
- MSIC code: 5-digit industrial classification.

INVOICE TYPE
- 01 = Invoice (default), 02 = Credit Note, 03 = Debit Note, 04 = Refund Note.
- If the document is a Purchase Order (PO), treat it as type 01.

SUPPLIER VS BUYER
- Supplier = seller / issuer of the invoice (the "From" or "Bill From" party).
- Buyer = customer / recipient (the "To", "Bill To", or "Sold To" party).
- Pay attention to which side has each label — orientation varies wildly between document templates.

LINE ITEMS
- Extract EVERY line item — never summarize or merge them.
- tax_type values: "SST" (6%), "Service Tax" (8%), "Exempt" (0%), "Zero Rated" (0%).
- If no tax shown on a line, use "Exempt" with rate 0.
- unit_of_measurement: short code like "EA" (each), "PCS", "HR", "MTH", "KG", etc. Default to "EA" if unspecified.

TITLE
- Generate a short, human-readable title for the invoice (e.g. "Office rent — Jan 2024", "Web hosting subscription — Q1 2024"). This helps the user recognize it later.

CONFIDENCE
- Set confidence to "high" when the document is clean and unambiguous.
- "medium" when most fields extracted but some required inference (e.g. computed totals, ambiguous dates).
- "low" when significant data is missing, the document is poor quality, or you had to guess essentials.

Be precise. Be conservative. When in doubt, leave it blank and tell the user via extraction_notes.`;

// JSON Schema for the extract_invoice function/tool input — shape is identical
// for both providers; only the outer envelope differs.
const EXTRACTION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    invoice_number: { type: 'string', description: 'The original invoice/PO number from the document' },
    po_number: { type: 'string', description: 'Purchase Order number/reference from the document (e.g. PO-000226). Empty if not shown.' },
    title: { type: 'string', description: 'Short human-readable label for the invoice' },
    invoice_date: { type: 'string', description: 'ISO YYYY-MM-DD' },
    due_date: { type: 'string', description: 'ISO YYYY-MM-DD if present, else empty string' },
    commence_date_start: { type: 'string', description: 'Service period start, ISO YYYY-MM-DD. Empty if not shown.' },
    commence_date_end: { type: 'string', description: 'Service period end, ISO YYYY-MM-DD. Empty if not shown.' },
    invoice_type: { type: 'string', enum: ['01', '02', '03', '04'], description: '01=Invoice (default), 02=Credit Note, 03=Debit Note, 04=Refund Note' },
    currency: { type: 'string', description: 'ISO 4217 code, default MYR' },
    payment_terms: { type: 'string', description: 'e.g. "Net 30", "Due on Receipt"' },
    is_self_billed: { type: 'boolean' },
    notes: { type: 'string', description: 'Any free-text notes/remarks present on the document' },

    supplier_name: { type: 'string' },
    supplier_tin: { type: 'string' },
    supplier_brn: { type: 'string' },
    supplier_sst_no: { type: 'string' },
    supplier_msic_code: { type: 'string' },
    supplier_address: { type: 'string' },
    supplier_phone: { type: 'string' },
    supplier_email: { type: 'string' },

    buyer_name: { type: 'string' },
    buyer_tin: { type: 'string' },
    buyer_brn: { type: 'string' },
    buyer_address: { type: 'string' },
    buyer_phone: { type: 'string' },
    buyer_email: { type: 'string' },

    items: {
      type: 'array',
      description: 'Every line item on the document, in order',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          discount_amount: { type: 'number' },
          tax_type: { type: 'string', enum: ['SST', 'Service Tax', 'Exempt', 'Zero Rated'] },
          tax_rate: { type: 'number' },
          unit_of_measurement: { type: 'string' },
          classification_code: { type: 'string' },
          po_number: { type: 'string', description: 'Per-line PO number when the line-items table has a PO column. Empty if not shown.' }
        },
        required: ['description', 'quantity', 'unit_price', 'tax_type', 'tax_rate']
      }
    },

    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    extraction_notes: {
      type: 'array',
      description: 'Warnings about unclear/missing/inferred fields. Empty if everything was clean.',
      items: { type: 'string' }
    }
  },
  required: ['supplier_name', 'buyer_name', 'invoice_date', 'items', 'confidence']
};

// ─── Anthropic path ─────────────────────────────────────────

let _anthropicClient = null;
function anthropicClient() {
  if (!_anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Configure it to use Anthropic extraction.');
    }
    _anthropicClient = new Anthropic();
  }
  return _anthropicClient;
}

async function extractViaAnthropic(pdfBuffer, filename) {
  const model = process.env.INVOICE_EXTRACTION_MODEL || 'claude-sonnet-4-6';

  const response = await anthropicClient().messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    tools: [{
      name: 'extract_invoice',
      description: 'Submit the extracted invoice/PO data from the document. Call this tool exactly once with the structured data.',
      input_schema: EXTRACTION_INPUT_SCHEMA
    }],
    tool_choice: { type: 'tool', name: 'extract_invoice' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64')
            }
          },
          {
            type: 'text',
            text: `Extract the invoice/PO data from this document (filename: ${filename}). Call the extract_invoice tool with the structured result.`
          }
        ]
      }
    ]
  });

  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_invoice');
  if (!toolUse) throw new Error('Model did not return structured extraction data');

  return {
    extracted: toolUse.input,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens || 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens || 0
    },
    model
  };
}

// ─── OpenAI-compatible (Qwen / other vision models) path ────

let _openaiClient = null;
function openaiClient() {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Configure it to use the OpenAI-compatible provider.');
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined
    });
  }
  return _openaiClient;
}

// Tunable knobs — vision providers charge per image, and upload size dominates
// latency when the endpoint is far away (e.g. third-party Asian resellers).
// Scale 1.5 keeps invoice text crisply readable while shrinking PNG ~45% vs 2.0.
// Most invoices are 1 page; cap at 3 to avoid waste on the rare multi-page doc.
const IMAGE_SCALE = parseFloat(process.env.INVOICE_EXTRACTION_IMAGE_SCALE) || 1.5;
const MAX_PAGES = parseInt(process.env.INVOICE_EXTRACTION_MAX_PAGES, 10) || 3;
const JPEG_QUALITY = parseInt(process.env.INVOICE_EXTRACTION_JPEG_QUALITY, 10) || 85;

// Convert PDF bytes to JPEG page images. JPEG at quality 85 produces ~30-50%
// smaller payloads than PNG for invoice content, which dominates latency on
// remote vision providers.
async function pdfToImageDataUrls(pdfBuffer, maxPages = MAX_PAGES) {
  const t0 = Date.now();
  const pdfjs = await getPdfJs();
  const { createCanvas } = require('@napi-rs/canvas');
  const { cMapUrl, standardFontDataUrl } = getPdfJsResourcePaths();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true
  });

  try {
    const doc = await loadingTask.promise;
    const total = Math.min(doc.numPages, maxPages);

    // Render pages in parallel — @napi-rs/canvas is thread-safe and pdfjs
    // returns a fresh page proxy per getPage() call.
    const renderPage = async (i) => {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: IMAGE_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      // White background so JPEG compression doesn't show through where the
      // canvas would be transparent.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const jpeg = await canvas.encode('jpeg', JPEG_QUALITY);
      page.cleanup();
      return { i, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, sizeKb: Math.round(jpeg.length / 1024) };
    };

    const rendered = await Promise.all(
      Array.from({ length: total }, (_, idx) => renderPage(idx + 1))
    );
    rendered.sort((a, b) => a.i - b.i);

    const elapsedMs = Date.now() - t0;
    logger.info('PDF rendered to images', {
      pages: total,
      scale: IMAGE_SCALE,
      totalSizeKb: rendered.reduce((s, r) => s + r.sizeKb, 0),
      elapsedMs
    });

    return rendered.map(r => r.dataUrl);
  } finally {
    await loadingTask.destroy();
  }
}

async function extractViaOpenAICompat(pdfBuffer, filename) {
  const model = process.env.OPENAI_MODEL || process.env.INVOICE_EXTRACTION_MODEL || 'fiq/qwen3.6-plus';

  const tRenderStart = Date.now();
  const imageUrls = await pdfToImageDataUrls(pdfBuffer);
  const renderMs = Date.now() - tRenderStart;
  if (imageUrls.length === 0) throw new Error('Could not convert PDF to images');

  const userContent = [
    ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
    {
      type: 'text',
      text: `Extract the invoice/PO data from this document (filename: ${filename}). Call the extract_invoice function with the structured result.`
    }
  ];

  const tApiStart = Date.now();
  const response = await openaiClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'extract_invoice',
        description: 'Submit the extracted invoice/PO data from the document. Call this function exactly once with the structured data.',
        parameters: EXTRACTION_INPUT_SCHEMA
      }
    }],
    tool_choice: { type: 'function', function: { name: 'extract_invoice' } }
  });

  const apiMs = Date.now() - tApiStart;

  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || !toolCall.function?.arguments) {
    throw new Error('Model did not return structured extraction data');
  }

  let extracted;
  try {
    extracted = JSON.parse(toolCall.function.arguments);
  } catch (err) {
    throw new Error(`Failed to parse extracted data: ${err.message}`);
  }

  logger.info('OpenAI-compat extraction timing', {
    filename,
    model,
    renderMs,
    apiMs,
    totalMs: renderMs + apiMs,
    pages: imageUrls.length
  });

  return {
    extracted,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      pages_rendered: imageUrls.length,
      render_ms: renderMs,
      api_ms: apiMs
    },
    model
  };
}

// ─── Dispatcher ──────────────────────────────────────────────

/**
 * @param {Buffer} pdfBuffer
 * @param {string} filename
 * @param {{ provider?: 'anthropic' | 'qwen' | 'openai' | 'openai-compat' }} [options]
 *   Per-request provider override. Falls back to INVOICE_EXTRACTION_PROVIDER env var,
 *   then to "anthropic".
 */
async function extractInvoiceFromPdf(pdfBuffer, filename = 'document.pdf', options = {}) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty');
  }

  const provider = (options.provider || DEFAULT_PROVIDER).toLowerCase();
  const useOpenAICompat = OPENAI_COMPAT_PROVIDERS.has(provider);

  const raw = useOpenAICompat
    ? await extractViaOpenAICompat(pdfBuffer, filename)
    : await extractViaAnthropic(pdfBuffer, filename);

  const result = { ...raw, provider };

  logger.info('Invoice extraction completed', {
    filename,
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    cacheReadTokens: result.usage.cache_read_input_tokens,
    cacheCreationTokens: result.usage.cache_creation_input_tokens,
    pagesRendered: result.usage.pages_rendered,
    confidence: result.extracted?.confidence
  });

  return result;
}

module.exports = { extractInvoiceFromPdf, DEFAULT_PROVIDER };
