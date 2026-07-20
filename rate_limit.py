"""Per-IP rate limiting shared by the API blueprints.

In-memory and per-process: full protection on the local/Railway server,
per-instance bounding on Vercel (each serverless instance keeps its own
window).
"""

import threading
import time
from collections import deque
from functools import wraps

from flask import jsonify, request

RATE_LIMIT_MAX_REQUESTS = 30
RATE_LIMIT_WINDOW_SECONDS = 60
# Above this many tracked IPs, expired buckets are swept so address churn
# (or an attacker rotating spoofed addresses) can't grow the table forever
_SWEEP_THRESHOLD = 1000
_rate_lock = threading.Lock()
_rate_hits = {}  # ip -> deque of request timestamps


def _client_ip():
    # Take the *last* X-Forwarded-For entry: it's appended by our own
    # platform proxy (Vercel/Railway), while earlier entries are
    # client-supplied and spoofable.
    forwarded = request.headers.get('X-Forwarded-For', '')
    last = forwarded.rsplit(',', 1)[-1].strip()
    return last or request.remote_addr or 'unknown'


def _prune(hits, now):
    while hits and now - hits[0] > RATE_LIMIT_WINDOW_SECONDS:
        hits.popleft()


def rate_limited(view):
    """Reject requests beyond RATE_LIMIT_MAX_REQUESTS per IP per window."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        now = time.time()
        with _rate_lock:
            if len(_rate_hits) > _SWEEP_THRESHOLD:
                for ip in list(_rate_hits):
                    _prune(_rate_hits[ip], now)
                    if not _rate_hits[ip]:
                        del _rate_hits[ip]
            hits = _rate_hits.setdefault(_client_ip(), deque())
            _prune(hits, now)
            if len(hits) >= RATE_LIMIT_MAX_REQUESTS:
                return jsonify({'error': 'Too many requests — please wait a minute and try again'}), 429
            hits.append(now)
        return view(*args, **kwargs)
    return wrapper
