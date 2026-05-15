import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter
from app.routers import search, restaurants

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Menuze API", version="0.1.0", docs_url=None, redoc_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS — only allow our own domains ────────────────────────────────────────
ALLOWED_ORIGINS = [
    "https://elienasr123.github.io",
    "http://localhost:8081",
    "http://localhost:19006",
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
    if request.url.path == "/health":
        return await call_next(request)

    origin = request.headers.get("origin", "")
    api_key = request.headers.get("x-api-key", "")

    # Block direct API calls (no browser origin) with wrong/missing key
    if not origin and API_KEY and api_key != API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

    return await call_next(request)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(search.router)
app.include_router(restaurants.router)

@app.get("/health")
def health():
    return {"status": "ok"}
