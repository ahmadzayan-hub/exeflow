"""Bound upload request bytes before the multipart parser allocates its files.

Authentication must wrap this middleware. A bounded, temporary request spool
keeps memory low and is always closed, including on disconnect and rejection.
This is a per-request byte limit, not concurrency/rate or decompression control.
"""

from tempfile import SpooledTemporaryFile

from starlette._utils import get_route_path
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

CHUNK_BYTES = 64 * 1024
SPOOL_MEMORY_BYTES = 1024 * 1024
MULTIPART_OVERHEAD_BYTES = 1024 * 1024


class UploadBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int):
        if max_body_bytes <= 0:
            raise ValueError("Upload request limit must be positive")
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if (scope["type"] != "http" or scope["method"] != "POST"
                or get_route_path(scope).rstrip("/") != "/api/upload"):
            await self.app(scope, receive, send)
            return

        async def reject(status: int, detail: str):
            response = JSONResponse({"detail": detail}, status_code=status,
                                    headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)

        lengths = [value for key, value in scope["headers"]
                   if key.lower() == b"content-length"]
        if (len(lengths) > 1 or (lengths and
                (not lengths[0] or any(c < 48 or c > 57 for c in lengths[0])))):
            await reject(400, "Invalid Content-Length")
            return
        if lengths:
            # Compare decimal strings so a hostile very long integer cannot
            # exceed Python's integer-conversion limit or produce a 500.
            length = lengths[0].lstrip(b"0") or b"0"
            limit = str(self.max_body_bytes).encode("ascii")
            if len(length) > len(limit) or (len(length) == len(limit) and length > limit):
                await reject(413, "Upload request exceeds the configured size limit")
                return

        with SpooledTemporaryFile(max_size=SPOOL_MEMORY_BYTES, mode="w+b") as spool:
            total = 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body = message.get("body", b"")
                total += len(body)
                if total > self.max_body_bytes:
                    await reject(413, "Upload request exceeds the configured size limit")
                    return
                # Slice before writing: a server may hand us one large chunk.
                # Avoid a large temporary in-memory spool before disk rollover.
                for start in range(0, len(body), CHUNK_BYTES):
                    await run_in_threadpool(spool.write, body[start:start + CHUNK_BYTES])
                if not message.get("more_body", False):
                    break
            await run_in_threadpool(spool.seek, 0)
            remaining = total
            finished = False

            async def replay():
                nonlocal remaining, finished
                if finished:
                    return await receive()
                data = await run_in_threadpool(spool.read, CHUNK_BYTES)
                remaining -= len(data)
                finished = remaining == 0
                return {"type": "http.request", "body": data, "more_body": not finished}

            await self.app(scope, replay, send)
