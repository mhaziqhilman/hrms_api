const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Get encryption key (32 bytes for AES-256)
 */
const getKey = () => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-encryption-key-change-me';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt a string
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted string (iv:ciphertext in hex)
 */
const encrypt = (text) => {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt a string
 * @param {string} encryptedText - Encrypted string (iv:ciphertext in hex)
 * @returns {string} Decrypted plain text
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return '';
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
