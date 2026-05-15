import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import search, restaurants

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Menuze API", version="0.1.0", docs_url=None, redoc_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS — only allow our own domains ────────────────────────────────────────
ALLOWED_ORIGINS = [
    "https://elienasr123.github.io",   # GitHub Pages web app
    "http://localhost:8081",           # Expo local dev
    "http://localhost:19006",          # Expo web dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── API key check ─────────────────────────────────────────────────────────────
API_KEY = os.environ.get("API_KEY", "")

@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    # Skip key check for health endpoint
    if request.url.path == "/health":
        return await call_next(request)

    # Allow requests from browser (CORS handles those)
    # For direct API calls, require the key
    origin = request.headers.get("origin", "")
    api_key = request.headers.get("x-api-key", "")

    if not origin:
        # Direct API call (not from browser) — require key
        if API_KEY and api_key != API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")

    return await call_next(request)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(search.router)
app.include_router(restaurants.router)

@app.get("/health")
def health():
    return {"status": "ok"}
