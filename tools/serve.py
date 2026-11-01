#!/usr/bin/env python3
"""Serve the simulator locally without browser caching, so a reload always picks up
changed scripts and data.

    python3 tools/serve.py          # http://127.0.0.1:8766  (8765 belongs to another project)
"""
import http.server, functools, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(NoCache, directory=ROOT)).serve_forever()
