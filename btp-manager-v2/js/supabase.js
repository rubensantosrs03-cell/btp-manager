import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKETS } from './config.js';

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function getSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, fullName, role) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listProjects() {
  const { data, error } = await db.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createProject(payload) {
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  const project = { ...payload, created_by: user?.id, access_code: payload.access_code || crypto.randomUUID().slice(0, 8) };
  const { data, error } = await db.from('projects').insert(project).select().single();
  if (error) throw error;
  await db.from('project_members').upsert({ project_id: data.id, user_id: user.id, role: 'admin' });
  return data;
}

export async function updateProject(id, payload) {
  const { data, error } = await db.from('projects').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await db.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function tableList(table, projectId, order = 'created_at') {
  let q = db.from(table).select('*');
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q.order(order, { ascending: order === 'sort_order' });
  if (error) throw error;
  return data || [];
}

export async function tableInsert(table, payload) {
  const { data, error } = await db.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function tableUpdate(table, id, payload) {
  const { data, error } = await db.from(table).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function tableDelete(table, id) {
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) throw error;
}

export function publicUrl(bucket, path) {
  if (!path) return '';
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadFile(bucketName, file, prefix = '') {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${prefix}${Date.now()}_${clean}`;
  const { error } = await db.storage.from(bucketName).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadPhoto(projectId, file, meta = {}) {
  const path = await uploadFile(STORAGE_BUCKETS.photos, file, `${projectId}/`);
  const { data: userData } = await db.auth.getUser();
  return tableInsert('photos', {
    project_id: projectId,
    storage_path: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: userData.user?.id,
    ...meta
  });
}

export async function uploadDocument(projectId, file, meta = {}) {
  const path = await uploadFile(STORAGE_BUCKETS.documents, file, `${projectId}/`);
  const { data: userData } = await db.auth.getUser();
  return tableInsert('documents', {
    project_id: projectId,
    storage_path: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: userData.user?.id,
    ...meta
  });
}

export function subscribeToChat(roomId, callback) {
  return db.channel(`chat:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, payload => callback(payload.new))
    .subscribe();
}
