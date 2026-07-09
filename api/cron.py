"""
Vercel Cron endpoint — called daily by Vercel Cron to refresh dashboard data.
Returns the fresh data so Vercel can cache it.
"""

import json
from http.server import BaseHTTPRequestHandler
from refresh import do_refresh


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Verify CRON_SECRET to prevent external abuse
        import os
        auth = self.headers.get("Authorization", "")
        expected = os.environ.get("CRON_SECRET", "")
        if expected and auth != "Bearer " + expected:
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "unauthorized"}).encode())
            return

        try:
            status, body = do_refresh()
        except Exception as e:
            status = 500
            body = {"error": "internal", "message": str(e)[:500]}

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(body, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        pass