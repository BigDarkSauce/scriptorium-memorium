#!/usr/bin/env python3
"""Scriptorium Memorialium's local server (Launch Scriptorium.bat): the app's files, plus the AI relay.

The relay lets the app, opened from this computer (http://localhost:8000), reach free LLM services a web page may not
call by itself: FreeLLMAPI on this computer (it only answers its own dashboard's address), NVIDIA NIM, GitHub Models,
Cloudflare, SambaNova (no cross-origin answers). The page asks  GET /__relay/info  to know it is here, then sends
GET|POST /__relay/fetch?u=<url>  with the request's headers and body; the answer streams back as it arrives.

It forwards only LLM-shaped addresses: https://.../models or .../chat/completions (any provider), and anything on this
computer (localhost / 127.0.0.1), and (?media=image) a picture link an image generator returned, refused unless
the answer is an image. Nothing else. It listens on localhost only.
python launcher/serve.py [port]   (default 8000; the folder above launcher/ is served)
"""
import http.server, json, os, socketserver, sys, urllib.request, urllib.error, urllib.parse, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = '1.0.0'
PASS_HEADERS = ('content-type', 'x-provider', 'x-model', 'retry-after', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'x-ratelimit-reset',
                'ratelimit-reset', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens')


def allowed(u, media=None):
    try:
        x = urllib.parse.urlsplit(u)
    except ValueError:
        return False
    if x.hostname in ('localhost', '127.0.0.1', '::1'):
        return x.scheme in ('http', 'https')
    if media == 'image':  # a picture an image generator returned as a link: the answer must be an image (checked below)
        return x.scheme == 'https'
    return x.scheme == 'https' and re.search(r'/(models|chat/completions)/?$', x.path) is not None


def _get(url, key=None, t=3):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key} if key else {}), timeout=t)
        return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def freellmapi_detect():
    """FreeLLMAPI on this computer: its port (its config.json; desktop app 31415, Docker/npm 3001) and its unified key
    (freellmapi- + 48 hex in its local SQLite database; the one the server accepts is the live one)."""
    home = os.path.expanduser('~'); dirs = []
    for d in [os.path.join(os.environ.get('APPDATA', ''), 'FreeLLMAPI') if os.environ.get('APPDATA') else '', os.path.join(home, 'AppData', 'Roaming', 'FreeLLMAPI'),
              os.path.join(home, 'Library', 'Application Support', 'FreeLLMAPI'), os.path.join(home, '.config', 'FreeLLMAPI')]:
        if d and os.path.isdir(d) and d not in dirs:
            dirs.append(d)
    ports = []
    for d in dirs:
        try:
            ports.append(int(json.load(open(os.path.join(d, 'config.json'))).get('port')))
        except Exception:
            pass
    ports += [31415, 3001]; base = None
    for p in dict.fromkeys(ports):
        st, _ = _get('http://127.0.0.1:%d/v1/models' % p)
        if st in (200, 401):
            base = 'http://127.0.0.1:%d/v1' % p; break
    if not base:
        return {'found': False, 'why': 'FreeLLMAPI is not running on this computer'}
    cands = []
    for d in dirs:
        for f in ('freeapi.db-wal', 'freeapi.db'):
            try:
                for m in re.findall(rb'freellmapi-[0-9a-f]{48}', open(os.path.join(d, f), 'rb').read()):
                    if m.decode() not in cands:
                        cands.append(m.decode())
            except OSError:
                pass
    key = next((k for k in cands if _get(base + '/usage', k)[0] == 200), None)
    _, ready = _get(base + '/models?execution_status=ready', key); _, allm = _get(base + '/models', key)
    n = lambda j: len(j.get('data', [])) if isinstance(j, dict) else None
    return {'found': True, 'base': base, 'key': key, 'keyFound': bool(key), 'candidates': len(cands), 'readyModels': n(ready), 'catalogModels': n(allm)}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):  # every answer says the relay is here (the page checks this on a HEAD of itself)
        self.send_header('X-Scriptorium-Relay', VERSION)
        super().end_headers()

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.json': 'application/json', '.wasm': 'application/wasm', '.mcpb': 'application/octet-stream'}

    def log_message(self, fmt, *args):  # quiet: only the relay's lines
        line = fmt % args if args else str(fmt)
        if '/__relay/' in line or 'code 4' in line or 'code 5' in line:
            sys.stderr.write(line + '\n')

    def _relay(self):
        q = urllib.parse.urlsplit(self.path)
        if q.path == '/__relay/info':
            body = json.dumps({'name': 'scriptorium-relay', 'version': VERSION}).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return True
        if q.path == '/__relay/freellmapi':
            body = json.dumps(freellmapi_detect()).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return True
        if q.path != '/__relay/fetch':
            return False
        qs = urllib.parse.parse_qs(q.query); u = (qs.get('u') or [''])[0]; media = (qs.get('media') or [None])[0]
        if media not in (None, 'image') or (media and self.command != 'GET'):
            self.send_error(403, 'Unknown media kind'); return True
        if not allowed(u, media):
            self.send_error(403, 'The relay only forwards LLM API addresses'); return True
        n = int(self.headers.get('Content-Length') or 0)
        data = self.rfile.read(n) if n else None
        hdr = {k: v for k, v in self.headers.items() if k.lower() in ('authorization', 'content-type', 'accept', 'http-referer', 'x-title')}
        req = urllib.request.Request(u, data=data, headers=hdr, method=self.command)
        try:
            r = urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as e:
            r = e
        except Exception as e:  # not reachable
            self.send_error(502, 'Not reachable: %s' % e); return True
        if media == 'image' and not (r.headers.get('content-type') or '').lower().startswith('image/'):
            self.send_error(502, 'That link is not an image'); return True
        self.send_response(r.status if hasattr(r, 'status') else r.code)
        for k, v in r.headers.items():
            if k.lower() in PASS_HEADERS:
                self.send_header(k, v)
        self.send_header('Cache-Control', 'no-store'); self.end_headers()
        try:
            while True:
                chunk = r.read1(8192) if hasattr(r, 'read1') else r.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        return True

    def do_GET(self):
        if not self._relay():
            super().do_GET()

    def do_POST(self):
        if not self._relay():
            self.send_error(405)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with Server(('localhost', port), Handler) as s:
        print('Scriptorium Memorialium is running at http://localhost:%d  (with the AI relay; close this window to stop)' % port)
        s.serve_forever()
