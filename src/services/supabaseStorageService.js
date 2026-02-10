const { supabase, STORAGE_BUCKET } = require('../config/supabase');

class SupabaseStorageService {
  /**
   * Upload a file to Supabase Storage
   * @param {Buffer} buffer - File buffer from multer memoryStorage
   * @param {string} storagePath - Path within the bucket (e.g., 'employees/123/documents/file.pdf')
   * @param {string} mimetype - File MIME type
   * @returns {Object} Upload result with path
   */
  async uploadFile(buffer, storagePath, mimetype) {
    if (!supabase) {
      throw new Error('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: false
      });

    if (error) {
      throw new Error(`Failed to upload file to Supabase: ${error.message}`);
    }

    return { path: data.path };
  }

  /**
   * Download a file from Supabase Storage
   * @param {string} storagePath - Path within the bucket
   * @returns {Buffer} File content as buffer
   */
  async downloadFile(storagePath) {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (error) {
      throw new Error(`Failed to download file from Supabase: ${error.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Generate a signed URL for temporary file access
   * @param {string} storagePath - Path within the bucket
   * @param {number} expiresIn - Expiry time in seconds (default 1 hour)
   * @returns {string} Signed URL
   */
  async getSignedUrl(storagePath, expiresIn = 3600) {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Delete a file from Supabase Storage
   * @param {string} storagePath - Path within the bucket
   */
  async deleteFile(storagePath) {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      throw new Error(`Failed to delete file from Supabase: ${error.message}`);
    }
  }

  /**
   * Check if Supabase Storage is configured and available
   * @returns {boolean}
   */
  isConfigured() {
    return supabase !== null;
  }
}

module.exports = new SupabaseStorageService();
