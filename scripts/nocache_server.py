import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
directory = sys.argv[2] if len(sys.argv) > 2 else "."
os.chdir(directory)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


http.server.test(HandlerClass=NoCacheHandler, port=port, bind="127.0.0.1")
