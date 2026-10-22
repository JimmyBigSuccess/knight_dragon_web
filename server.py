"""Local development server for Knight & Dragon (not required on static hosting)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    host, port = "0.0.0.0", 8000
    print(f"遊戲已啟動：http://localhost:{port}")
    print("手機可在同一 Wi-Fi 開啟：http://<電腦區域網路IP>:8000")
    ThreadingHTTPServer((host, port), SimpleHTTPRequestHandler).serve_forever()
