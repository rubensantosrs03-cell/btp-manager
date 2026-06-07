/* ================================================================
   BTP MANAGER — SUPABASE.JS
   Supabase client initialization
   Compatible with existing schema (no DB changes)
   ================================================================ */

// ════════════════════════════════════════════════════
//  ⚙️  YOUR SUPABASE CREDENTIALS
//  Paste your values below — never use the secret key here
// ════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://kleefoouttyzzsjgopxm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_wllDkNp2LbmWsEdXLX9y3g_YXMdAuY1';
// ════════════════════════════════════════════════════

const { createClient } = supabase;

const DB = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// Storage helpers — returns a signed or public URL for a file
const Storage = {
  /**
   * Get a signed URL (works for private buckets — recommended)
   * @param {string} bucket  'photos' | 'documents'
   * @param {string} path    file path inside the bucket
   * @param {number} expiresIn  seconds (default 3600 = 1 h)
   */
  async signedUrl(bucket, path, expiresIn = 3600) {
    if (!path) return null;
    const { data, error } = await DB.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) { console.warn('Storage.signedUrl error:', error.message); return null; }
    return data?.signedUrl ?? null;
  },

  /**
   * Get a public URL (works only if bucket is set to public)
   * Falls back gracefully if the bucket is private.
   */
  publicUrl(bucket, path) {
    if (!path) return null;
    const { data } = DB.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl ?? null;
  },

  /**
   * Smart URL resolver — tries signed URL first, falls back to public
   */
  async resolveUrl(bucket, path) {
    if (!path) return null;
    const signed = await this.signedUrl(bucket, path);
    return signed ?? this.publicUrl(bucket, path);
  },

  /**
   * Upload a file and return the storage path
   */
  async upload(bucket, path, file, options = {}) {
    const { data, error } = await DB.storage
      .from(bucket)
      .upload(path, file, { upsert: true, ...options });
    if (error) throw error;
    return data.path;
  },

  /**
   * Remove a file
   */
  async remove(bucket, paths) {
    const arr = Array.isArray(paths) ? paths : [paths];
    const { error } = await DB.storage.from(bucket).remove(arr);
    if (error) console.warn('Storage.remove error:', error.message);
  },
};
