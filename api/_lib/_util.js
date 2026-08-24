// api/_lib/_util.js
// Helpers partages entre les endpoints API.

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
