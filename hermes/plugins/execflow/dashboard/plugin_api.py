"""Disabled Hermes dashboard integration, pending verified inbound authentication.

Do not inject an ExecFlow service credential here. The host's authentication and
authorization contract has not been verified. No environment flag enables this
proxy, and no upstream network client is present.
"""

from fastapi import APIRouter, Depends, HTTPException


def proxy_unavailable():
    raise HTTPException(503, "ExecFlow dashboard proxy is disabled pending verified inbound authentication")


router = APIRouter(dependencies=[Depends(proxy_unavailable)])


@router.get("/overview")
async def overview():
    proxy_unavailable()


@router.get("/runs/{run_id}")
async def run(run_id: str):
    proxy_unavailable()


@router.post("/analyse")
async def analyse(body: dict):
    proxy_unavailable()
