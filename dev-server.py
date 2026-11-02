"""Local dev server with the same deep-link behaviour as the live site.

Serves this folder like `python -m http.server`, but an address that is not a
file (/project-management, /admin/feedback) is sent back to the app root as
/?redirect=<address> — exactly what stouras.com's root 404.html does for
/ucd-blog/… on GitHub Pages — and router.js restores it. Nothing is cached, so
an edited module is picked up on the next reload.

    python dev-server.py 8787                then open http://127.0.0.1:8787/?local
    python dev-server.py 8766 /ucd-blog      the app mounted as on stouras.com: http://127.0.0.1:8766/ucd-blog/?local
"""
import functools
import http.server
import os
import sys
import urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
MOUNT = (sys.argv[2] if len(sys.argv) > 2 else '').rstrip('/')   # '' or '/ucd-blog'
HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def redirect(self, location):
        self.send_response(302)
        self.send_header('Location', location)
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if MOUNT:
            if path == MOUNT:
                return self.redirect(MOUNT + '/')
            if not path.startswith(MOUNT + '/'):
                return self.redirect(MOUNT + '/')   # the rest of stouras.com is not served here
            path = path[len(MOUNT):]
            self.path = path + self.path[len(MOUNT) + len(path):]
        if path != '/' and not os.path.exists(self.translate_path(path)):
            return self.redirect(MOUNT + '/?redirect=' + urllib.parse.quote(MOUNT + self.path, safe=''))
        super().do_GET()


if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=HERE))
    print(f'UCD blog dev server: http://127.0.0.1:{PORT}{MOUNT}/?local  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
