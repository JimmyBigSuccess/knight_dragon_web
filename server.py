"""Local static file server; no third-party packages required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

if __name__ == '__main__':
    os.chdir(Path(__file__).resolve().parent)
    print('Computer: http://localhost:8000')
    print('Phone on same Wi-Fi: http://YOUR_COMPUTER_LAN_IP:8000')
    ThreadingHTTPServer(('0.0.0.0', 8000), SimpleHTTPRequestHandler).serve_forever()
