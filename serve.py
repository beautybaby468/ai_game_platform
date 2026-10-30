"""本地游戏服务器：禁用浏览器缓存，保证改版立即生效。端口 8803。"""
import http.server
import socketserver

PORT = 8803

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 静默日志

if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'serving at http://127.0.0.1:{PORT}')
        httpd.serve_forever()
