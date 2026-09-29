import http.server, socketserver

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

PORT = 8849
# Multi-connexions : en TCPServer simple, une connexion ouverte d'avance par le
# navigateur (préconnexion) et restée muette bloquait toutes les autres — la
# page restait « en chargement » indéfiniment.
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("", PORT), NoCache) as httpd:
    print(f"no-cache dev server on {PORT}")
    httpd.serve_forever()
