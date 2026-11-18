#!/bin/bash
cd "$(dirname "$0")"
mkdir -p "뽑기 결과"

python3 - << 'EOF'
import http.server
import socketserver
import json
import os
import base64
import webbrowser
import threading

APP_DIR = os.getcwd()
RESULT_DIR = os.path.join(APP_DIR, "뽑기 결과")
ROSTER_PATH = os.path.join(APP_DIR, "roster_data.js")
os.makedirs(RESULT_DIR, exist_ok=True)

class UsbAppHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path.startswith('/api/usb-status'):
            os.makedirs(RESULT_DIR, exist_ok=True)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "folder": RESULT_DIR}).encode('utf-8'))
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/save-image'):
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            filename = os.path.basename(data.get('filename', 'result.png'))
            data_url = data.get('dataUrl', '')
            if ',' in data_url:
                b64_part = data_url.split(',', 1)[1]
            else:
                b64_part = data_url

            os.makedirs(RESULT_DIR, exist_ok=True)
            save_path = os.path.join(RESULT_DIR, filename)
            with open(save_path, 'wb') as f:
                f.write(base64.b64decode(b64_part))

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "filename": filename, "path": save_path}).encode('utf-8'))
            return

        if self.path.startswith('/api/save-roster'):
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            js_content = data.get('jsContent', '')
            if js_content:
                with open(ROSTER_PATH, 'w', encoding='utf-8') as f:
                    f.write(js_content)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

with socketserver.TCPServer(("127.0.0.1", 0), UsbAppHandler) as httpd:
    port = httpd.server_address[1]
    url = f"http://127.0.0.1:{port}/index.html"
    print("=========================================================")
    print(" [랜덤 발표 순서 뽑기] USB 포터블 실행기 가동 중")
    print(f" 이미지 자동 저장 위치: {RESULT_DIR}")
    print(f" 학생 명단 자동 보존 파일: {ROSTER_PATH}")
    print(f" 접속 주소: {url}")
    print(" (사용을 마치면 이 창을 닫으세요)")
    print("=========================================================")
    threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
EOF
