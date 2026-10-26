"""Vercel ASGI entrypoint. The same application runs in Docker and locally."""
from backend.app import app

__all__ = ["app"]
