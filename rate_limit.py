"""Per-IP rate limiting shared by the API blueprints.

In-memory and per-process: full protection on a single-process server,
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
_rate_hits = {}  # (bucket, ip) -> deque of request timestamps


def _client_ip():
    # Take the *last* X-Forwarded-For entry: it's appended by our own
    # platform proxy (Vercel), while earlier entries are client-supplied
    # and spoofable.
    forwarded = request.headers.get('X-Forwarded-For', '')
    last = forwarded.rsplit(',', 1)[-1].strip()
    return last or request.remote_addr or 'unknown'


def _prune(hits, now):
    while hits and now - hits[0] > RATE_LIMIT_WINDOW_SECONDS:
        hits.popleft()


def rate_limited(view=None, *, max_requests=None, bucket='api'):
    """Reject requests beyond a per-IP limit per window.

    Used bare (@rate_limited), an endpoint shares the default bucket and
    limit. Endpoints whose upstream quota is scarcer pass their own
    max_requests/bucket so their budget is tracked separately — heavy use
    of the shared bucket can't lock them out, and vice versa.
    """
    if view is None:
        return lambda v: rate_limited(v, max_requests=max_requests, bucket=bucket)

    @wraps(view)
    def wrapper(*args, **kwargs):
        limit = RATE_LIMIT_MAX_REQUESTS if max_requests is None else max_requests
        now = time.time()
        with _rate_lock:
            if len(_rate_hits) > _SWEEP_THRESHOLD:
                for key in list(_rate_hits):
                    _prune(_rate_hits[key], now)
                    if not _rate_hits[key]:
                        del _rate_hits[key]
            hits = _rate_hits.setdefault((bucket, _client_ip()), deque())
            _prune(hits, now)
            if len(hits) >= limit:
                return jsonify({'error': 'Too many requests — please wait a minute and try again'}), 429
            hits.append(now)
        return view(*args, **kwargs)
    return wrapper
