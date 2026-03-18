const crypto = require('crypto');
const lhdnConfig = require('../config/lhdn');
const logger = require('../utils/logger');

/**
 * LHDN MyInvois API Service
 * Dual-mode: mock (no credentials) or real (with credentials)
 * Auto-detects mode based on LHDN_CLIENT_ID environment variable
 */
class LhdnService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.useMock = !lhdnConfig.clientId || lhdnConfig.environment === 'sandbox';
  }

  // ─── Authentication ─────────────────────────────────────────

  async authenticate() {
    if (this.useMock) {
      return this._mockAuthenticate();
    }
    return this._realAuthenticate();
  }

  async _mockAuthenticate() {
    await this._simulateDelay(500);
    this.accessToken = `mock_token_${crypto.randomUUID()}`;
    this.tokenExpiresAt = Date.now() + 3600 * 1000;
    logger.info('[LHDN Mock] Authenticated successfully');
    return { access_token: this.accessToken, expires_in: 3600 };
  }

  async _realAuthenticate() {
    const url = `${lhdnConfig.apiUrl}${lhdnConfig.endpoints.login}`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: lhdnConfig.clientId,
      client_secret: lhdnConfig.clientSecret,
      scope: 'InvoicingAPI'
    });

    const response = await this._fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    logger.info('[LHDN] Authenticated successfully');
    return data;
  }

  async _ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt - 60000) {
      await this.authenticate();
    }
  }

  // ─── Submit Document ────────────────────────────────────────

  async submitDocument(invoice, items) {
    if (this.useMock) {
      return this._mockSubmitDocument(invoice, items);
    }
    return this._realSubmitDocument(invoice, items);
  }

  async _mockSubmitDocument(invoice, items) {
    await this._simulateDelay(2000);

    const uuid = crypto.randomUUID();
    const submissionUID = crypto.randomUUID();
    const longId = `${uuid}${crypto.randomBytes(16).toString('hex')}`;

    // 90% success, 10% rejection
    const isRejected = Math.random() < 0.1;

    if (isRejected) {
      logger.info(`[LHDN Mock] Document rejected: ${invoice.invoice_number}`);
      return {
        submissionUID,
        acceptedDocuments: [],
        rejectedDocuments: [{
          invoiceCodeNumber: invoice.invoice_number,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Mock validation failed',
            details: [
              { code: 'FV001', message: 'Supplier TIN is invalid or not registered with LHDN', target: 'supplier_tin' },
              { code: 'FV002', message: 'Tax calculation mismatch detected', target: 'total_tax' }
            ]
          }
        }]
      };
    }

    logger.info(`[LHDN Mock] Document submitted successfully: ${invoice.invoice_number}`);
    return {
      submissionUID,
      acceptedDocuments: [{
        uuid,
        invoiceCodeNumber: invoice.invoice_number,
        longId
      }],
      rejectedDocuments: []
    };
  }

  async _realSubmitDocument(invoice, items) {
    await this._ensureAuthenticated();

    const payload = this.buildSubmissionPayload(invoice, items);
    const url = `${lhdnConfig.apiUrl}${lhdnConfig.endpoints.submitDocument}`;

    const response = await this._fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ documents: [{ format: 'JSON', document: payload }] })
    });

    return response.json();
  }

  // ─── Get Document Status ────────────────────────────────────

  async getDocumentStatus(lhdnUuid) {
    if (this.useMock) {
      return this._mockGetDocumentStatus(lhdnUuid);
    }
    return this._realGetDocumentStatus(lhdnUuid);
  }

  async _mockGetDocumentStatus(lhdnUuid) {
    await this._simulateDelay(1000);

    // 90% Valid, 10% Invalid
    const isValid = Math.random() >= 0.1;

    if (isValid) {
      logger.info(`[LHDN Mock] Document validated: ${lhdnUuid}`);
      return {
        uuid: lhdnUuid,
        status: 'Valid',
        validationResults: { status: 'Valid', validationSteps: [] },
        dateTimeValidated: new Date().toISOString()
      };
    }

    logger.info(`[LHDN Mock] Document invalid: ${lhdnUuid}`);
    return {
      uuid: lhdnUuid,
      status: 'Invalid',
      validationResults: {
        status: 'Invalid',
        validationSteps: [{
          status: 'Invalid',
          name: 'Tax Calculation Validation',
          error: { code: 'CV001', message: 'Total tax amount does not match sum of line item taxes' }
        }]
      }
    };
  }

  async _realGetDocumentStatus(lhdnUuid) {
    await this._ensureAuthenticated();

    const url = `${lhdnConfig.apiUrl}${lhdnConfig.endpoints.getDocument}/${lhdnUuid}/details`;
    const response = await this._fetchWithRetry(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    return response.json();
  }

  // ─── Cancel Document ────────────────────────────────────────

  async cancelDocument(lhdnUuid, reason) {
    if (this.useMock) {
      return this._mockCancelDocument(lhdnUuid, reason);
    }
    return this._realCancelDocument(lhdnUuid, reason);
  }

  async _mockCancelDocument(lhdnUuid, reason) {
    await this._simulateDelay(1000);
    logger.info(`[LHDN Mock] Document cancelled: ${lhdnUuid}, reason: ${reason}`);
    return {
      uuid: lhdnUuid,
      status: 'Cancelled'
    };
  }

  async _realCancelDocument(lhdnUuid, reason) {
    await this._ensureAuthenticated();

    const url = `${lhdnConfig.apiUrl}${lhdnConfig.endpoints.cancelDocument}/${lhdnUuid}/state`;
    const response = await this._fetchWithRetry(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'cancelled', reason })
    });

    return response.json();
  }

  // ─── Validate TIN ───────────────────────────────────────────

  async validateTIN(tin) {
    if (this.useMock) {
      return this._mockValidateTIN(tin);
    }
    return this._realValidateTIN(tin);
  }

  async _mockValidateTIN(tin) {
    await this._simulateDelay(500);

    // Basic format validation: C followed by 10-13 digits, or IG prefix
    const isValid = /^(C\d{10,13}|IG\d{10,13})$/.test(tin);

    logger.info(`[LHDN Mock] TIN validation: ${tin} → ${isValid ? 'valid' : 'invalid'}`);
    return {
      isValid,
      tin,
      name: isValid ? 'Mock Taxpayer Name' : null,
      message: isValid ? 'TIN is valid' : 'Invalid TIN format. Expected: C followed by 10-13 digits'
    };
  }

  async _realValidateTIN(tin) {
    await this._ensureAuthenticated();

    const url = `${lhdnConfig.apiUrl}${lhdnConfig.endpoints.validateTIN}/${encodeURIComponent(tin)}`;
    const response = await this._fetchWithRetry(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    return response.json();
  }

  // ─── UBL 2.1 Payload Builder ────────────────────────────────

  buildSubmissionPayload(invoice, items) {
    return {
      _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      ID: [{ _: invoice.invoice_number }],
      IssueDate: [{ _: invoice.invoice_date }],
      InvoiceTypeCode: [{ _: invoice.invoice_type, listVersionID: '1.0' }],
      DocumentCurrencyCode: [{ _: invoice.currency || 'MYR' }],
      AccountingSupplierParty: [{
        Party: [{
          PartyIdentification: [
            { ID: [{ _: invoice.supplier_tin, schemeID: 'TIN' }] },
            { ID: [{ _: invoice.supplier_brn, schemeID: 'BRN' }] }
          ],
          PartyName: [{ Name: [{ _: invoice.supplier_name }] }],
          PostalAddress: [{ AddressLine: [{ Line: [{ _: invoice.supplier_address || '' }] }] }],
          Contact: [{
            Telephone: [{ _: invoice.supplier_phone || '' }],
            ElectronicMail: [{ _: invoice.supplier_email || '' }]
          }],
          IndustryClassificationCode: [{ _: invoice.supplier_msic_code || '' }]
        }]
      }],
      AccountingCustomerParty: [{
        Party: [{
          PartyIdentification: [
            { ID: [{ _: invoice.buyer_tin, schemeID: 'TIN' }] },
            { ID: [{ _: invoice.buyer_brn, schemeID: 'BRN' }] }
          ],
          PartyName: [{ Name: [{ _: invoice.buyer_name }] }],
          PostalAddress: [{ AddressLine: [{ Line: [{ _: invoice.buyer_address || '' }] }] }],
          Contact: [{
            Telephone: [{ _: invoice.buyer_phone || '' }],
            ElectronicMail: [{ _: invoice.buyer_email || '' }]
          }]
        }]
      }],
      LegalMonetaryTotal: [{
        LineExtensionAmount: [{ _: parseFloat(invoice.subtotal || 0), currencyID: invoice.currency || 'MYR' }],
        TaxExclusiveAmount: [{ _: parseFloat(invoice.subtotal || 0), currencyID: invoice.currency || 'MYR' }],
        TaxInclusiveAmount: [{ _: parseFloat(invoice.total_amount || 0), currencyID: invoice.currency || 'MYR' }],
        AllowanceTotalAmount: [{ _: parseFloat(invoice.total_discount || 0), currencyID: invoice.currency || 'MYR' }],
        PayableAmount: [{ _: parseFloat(invoice.total_amount || 0), currencyID: invoice.currency || 'MYR' }]
      }],
      TaxTotal: [{
        TaxAmount: [{ _: parseFloat(invoice.total_tax || 0), currencyID: invoice.currency || 'MYR' }]
      }],
      InvoiceLine: (items || []).map((item, idx) => ({
        ID: [{ _: String(idx + 1) }],
        InvoicedQuantity: [{ _: parseFloat(item.quantity || 1), unitCode: item.unit_of_measurement || 'EA' }],
        LineExtensionAmount: [{ _: parseFloat(item.subtotal || 0), currencyID: invoice.currency || 'MYR' }],
        Item: [{
          Description: [{ _: item.description }],
          CommodityClassification: [{ ItemClassificationCode: [{ _: item.classification_code || '' }] }]
        }],
        Price: [{ PriceAmount: [{ _: parseFloat(item.unit_price || 0), currencyID: invoice.currency || 'MYR' }] }],
        TaxTotal: [{
          TaxAmount: [{ _: parseFloat(item.tax_amount || 0), currencyID: invoice.currency || 'MYR' }],
          TaxSubtotal: [{
            TaxableAmount: [{ _: parseFloat(item.subtotal || 0), currencyID: invoice.currency || 'MYR' }],
            TaxAmount: [{ _: parseFloat(item.tax_amount || 0), currencyID: invoice.currency || 'MYR' }],
            TaxCategory: [{
              ID: [{ _: item.tax_type || 'E' }],
              Percent: [{ _: parseFloat(item.tax_rate || 0) }]
            }]
          }]
        }]
      }))
    };
  }

  // ─── Helpers ────────────────────────────────────────────────

  async _fetchWithRetry(url, options) {
    const { attempts, delay } = lhdnConfig.retry;
    let lastError;

    for (let i = 0; i < attempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), lhdnConfig.timeout);

        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);

        // Don't retry on client errors (4xx) except 408, 429
        if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429)) {
          return response;
        }

        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        logger.warn(`[LHDN] Request failed (attempt ${i + 1}/${attempts}): ${lastError.message}`);
      } catch (error) {
        lastError = error;
        logger.warn(`[LHDN] Request error (attempt ${i + 1}/${attempts}): ${error.message}`);
      }

      if (i < attempts - 1) {
        const backoff = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError;
  }

  async _simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LhdnService();
