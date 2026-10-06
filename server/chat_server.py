#!/usr/bin/env python3
"""Serve the Meditron site and relay its chat to the RCP endpoint.

The page cannot call RCP itself: the API key would be public. This server holds
the key and exposes one route, /api/chat, next to the static files:

  GET  /api/chat   health check; the page enables the chat only if this answers
  POST /api/chat   {"messages": [{"role": "user"|"assistant", "content": str}, ...]}
                   -> RCP's OpenAI-style SSE stream, passed through unchanged

Everything that matters for the answer is pinned here, not taken from the page:
model, temperature, max_tokens, and the optional system prompt. Temperature in
particular: with none sent, vLLM on RCP samples MeditronFO at 1.0, which is what
truncated its MOOVE answers (meditron-4/truncation/README.md).

The RCP key allows one request in flight, so requests are served one at a time;
a request that waits longer than QUEUE_WAIT seconds gets a 429 the page shows.
Each client address also gets RATE_LIMIT requests per RATE_WINDOW seconds.

Stdlib only, like truncation/fetch_rcp.py: the login node has no openai package.

    set -a; . ~/meditron-4/.env; set +a
    python3 server/chat_server.py --port 8000
"""

import argparse
import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RCP_BASE_URL = "https://inference-rcp.epfl.ch/v1"
MODEL = os.environ.get("MEDITRON_MODEL", "EPFLiGHT/Apertus-70B-MeditronFO")
TEMPERATURE = float(os.environ.get("MEDITRON_TEMPERATURE", "0.7"))
MAX_TOKENS = int(os.environ.get("MEDITRON_MAX_TOKENS", "2048"))
SYSTEM_PROMPT = os.environ.get("MEDITRON_SYSTEM_PROMPT", "")

MAX_BODY = 64 * 1024          # bytes of request JSON
MAX_MESSAGES = 12             # conversation turns kept
MAX_CHARS = 4000              # per message
QUEUE_WAIT = 90               # seconds a request may wait for the RCP slot
RATE_LIMIT, RATE_WINDOW = 12, 600
TIMEOUT = 300                 # seconds for one RCP answer

SITE = Path(__file__).resolve().parent.parent
rcp_slot = threading.Semaphore(1)
recent = defaultdict(deque)   # client address -> request times
recent_lock = threading.Lock()


def rate_limited(addr):
    now = time.time()
    with recent_lock:
        q = recent[addr]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return True
        q.append(now)
        return False


def clean_messages(body):
    msgs = body.get("messages")
    if not isinstance(msgs, list) or not msgs:
        raise ValueError("messages must be a non-empty list")
    out = []
    for m in msgs[-MAX_MESSAGES:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            raise ValueError("each message needs role user or assistant")
        content = m.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("each message needs text content")
        out.append({"role": m["role"], "content": content[:MAX_CHARS]})
    if out[-1]["role"] != "user":
        raise ValueError("the last message must be the user's")
    if SYSTEM_PROMPT:
        out.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    return out


class Handler(SimpleHTTPRequestHandler):
    allowed_origins = ()
    trust_proxy = False

    def client(self):
        if self.trust_proxy:
            fwd = self.headers.get("X-Forwarded-For")
            if fwd:
                return fwd.split(",")[0].strip()
        return self.client_address[0]

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and origin in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if self.path != "/api/chat":
            return self.reply(404, {"error": "not found"})
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/chat":
            return self.reply(200, {"ok": True, "model": MODEL})
        if self.path.split("/")[1] in (".git", "server"):
            return self.reply(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/chat":
            return self.reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self.reply(413, {"error": "The question is too long."})
        try:
            messages = clean_messages(json.loads(self.rfile.read(length)))
        except (ValueError, json.JSONDecodeError) as e:
            return self.reply(400, {"error": str(e)})
        if rate_limited(self.client()):
            return self.reply(429, {"error": "You have sent many questions in a short time. Wait a few minutes."})
        if not rcp_slot.acquire(timeout=QUEUE_WAIT):
            return self.reply(429, {"error": "Meditron is busy answering other people."})
        try:
            self.relay(messages)
        finally:
            rcp_slot.release()

    def relay(self, messages):
        payload = {"model": MODEL, "messages": messages, "stream": True,
                   "temperature": TEMPERATURE, "max_tokens": MAX_TOKENS}
        req = urllib.request.Request(
            f"{RCP_BASE_URL}/chat/completions", data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {os.environ['RCP_API_KEY']}",
                     "Content-Type": "application/json"})
        try:
            upstream = urllib.request.urlopen(req, timeout=TIMEOUT)
        except urllib.error.HTTPError as e:
            self.log_error("RCP answered %s: %s", e.code, e.read()[:300])
            busy = e.code == 429
            return self.reply(429 if busy else 502, {"error": "Meditron is busy answering other people." if busy
                                                     else "The Meditron server did not answer."})
        except (urllib.error.URLError, TimeoutError) as e:
            self.log_error("RCP unreachable: %s", e)
            return self.reply(502, {"error": "The Meditron server could not be reached."})
        # HTTP/1.0 response without Content-Length: the stream ends when we close.
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with upstream:
            try:
                for line in upstream:
                    self.wfile.write(line)
                    if line == b"\n":
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # the reader pressed Stop or left; closing upstream ends generation


def main():
    p = argparse.ArgumentParser(description="Serve the Meditron site with its RCP chat relay.")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--allow-origin", action="append", default=[],
                   help="extra origin allowed to call /api/chat, e.g. https://epfllight.github.io")
    p.add_argument("--trust-proxy", action="store_true",
                   help="rate-limit by X-Forwarded-For (only behind a reverse proxy you run)")
    args = p.parse_args()
    if not os.environ.get("RCP_API_KEY"):
        raise SystemExit("Set RCP_API_KEY (`set -a; . ~/meditron-4/.env; set +a`).")
    Handler.allowed_origins = tuple(args.allow_origin)
    Handler.trust_proxy = args.trust_proxy
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(SITE)))
    print(f"Meditron site on http://{args.host}:{args.port}  model={MODEL}  "
          f"temperature={TEMPERATURE}  max_tokens={MAX_TOKENS}")
    server.serve_forever()


if __name__ == "__main__":
    main()
