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
_bucket_windows = {}  # bucket -> its window_seconds, so the sweep below prunes each bucket correctly


def _client_ip():
    # Take the *last* X-Forwarded-For entry: it's appended by our own
    # platform proxy (Vercel), while earlier entries are client-supplied
    # and spoofable.
    forwarded = request.headers.get('X-Forwarded-For', '')
    last = forwarded.rsplit(',', 1)[-1].strip()
    return last or request.remote_addr or 'unknown'


def _prune(hits, now, window_seconds):
    while hits and now - hits[0] > window_seconds:
        hits.popleft()


def rate_limited(view=None, *, max_requests=None, bucket='api', window_seconds=None, message=None):
    """Reject requests beyond a per-IP limit per window.

    Used bare (@rate_limited), an endpoint shares the default bucket, limit,
    and 60-second window. Endpoints whose upstream quota is scarcer pass
    their own max_requests/bucket so their budget is tracked separately —
    heavy use of the shared bucket can't lock them out, and vice versa.
    window_seconds lets a route layer a longer-window cap (e.g. a daily
    ceiling) on top of the default burst window by stacking a second
    @rate_limited with its own bucket.
    """
    if view is None:
        return lambda v: rate_limited(
            v, max_requests=max_requests, bucket=bucket,
            window_seconds=window_seconds, message=message,
        )

    @wraps(view)
    def wrapper(*args, **kwargs):
        limit = RATE_LIMIT_MAX_REQUESTS if max_requests is None else max_requests
        window = RATE_LIMIT_WINDOW_SECONDS if window_seconds is None else window_seconds
        now = time.time()
        with _rate_lock:
            _bucket_windows[bucket] = window
            if len(_rate_hits) > _SWEEP_THRESHOLD:
                for key in list(_rate_hits):
                    key_window = _bucket_windows.get(key[0], RATE_LIMIT_WINDOW_SECONDS)
                    _prune(_rate_hits[key], now, key_window)
                    if not _rate_hits[key]:
                        del _rate_hits[key]
            hits = _rate_hits.setdefault((bucket, _client_ip()), deque())
            _prune(hits, now, window)
            if len(hits) >= limit:
                error = message or 'Too many requests — please wait a minute and try again'
                return jsonify({'error': error}), 429
            hits.append(now)
        return view(*args, **kwargs)
    return wrapper
