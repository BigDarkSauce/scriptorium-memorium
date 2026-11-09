// Where the reader is, in the address bar: a link or a reload reopens that place, and Back / Forward walk through the
// places visited (main.js App.route, App.onRoute).
//   (no hash)                          the library hub
//   #room=<bookId>                     that book's room
//   #room=<bookId>&scroll=<partId>     that room with the scroll open in the reader
// The ids are written with URLSearchParams (percent-encoded), so any id, whatever characters it holds, makes a safe
// address and reads back unchanged; anything else in the hash is ignored.
export function parseHash(hash) {
  let q; try { q = new URLSearchParams(String(hash || '').replace(/^#/, '')); } catch (e) { return {}; }
  const room = q.get('room'), scroll = q.get('scroll');
  return room ? { room, scroll: scroll || null } : {};
}
export function formatHash(r) {
  if (!r || !r.room) return '';
  const q = new URLSearchParams(); q.set('room', r.room); if (r.scroll) q.set('scroll', r.scroll);
  return '#' + q.toString();
}
export const sameRoute = (a, b) => formatHash(a) === formatHash(b);
