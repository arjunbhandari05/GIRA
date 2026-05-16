"""Serialize NCBI E-utilities calls to stay within rate limits."""

from __future__ import annotations

import os
import threading
import time

_lock = threading.Lock()
_last_call = 0.0


def ncbi_min_interval() -> float:
    """~9 req/s with API key (NCBI allows 10/s); ~3/s without."""
    if os.getenv("NCBI_API_KEY", "").strip():
        return 0.11
    return 0.34


def ncbi_wait() -> None:
    """Block until the next NCBI request slot is available."""
    global _last_call
    interval = ncbi_min_interval()
    with _lock:
        now = time.monotonic()
        delay = interval - (now - _last_call)
        if delay > 0:
            time.sleep(delay)
        _last_call = time.monotonic()
