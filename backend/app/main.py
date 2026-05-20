import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from app.limiter import limiter
from app.routers import search, restaurants, snapshots, retail
from app.database import engine

# ── Auto-migration ────────────────────────────────────────────────────────────
def run_migrations():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS price_snapshots (
                id SERIAL PRIMARY KEY,
                dish_id INTEGER NOT NULL,
                price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
                price_lbp DECIMAL(12,0) NOT NULL DEFAULT 0,
                recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_price_snapshots_dish
            ON price_snapshots(dish_id, recorded_at DESC)
        """))
        conn.execute(text("ALTER TABLE dishes ADD COLUMN IF NOT EXISTS prev_price_usd DECIMAL(10,2) DEFAULT NULL"))
        conn.execute(text("ALTER TABLE dishes ADD COLUMN IF NOT EXISTS prev_price_lbp DECIMAL(12,0) DEFAULT NULL"))
        conn.execute(text("ALTER TABLE dishes ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL"))
        conn.execute(text("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS retail_products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                brand TEXT,
                sku TEXT,
                price_usd DECIMAL(10,2) DEFAULT 0,
                image_url TEXT,
                category TEXT,
                subcategory TEXT,
                platform TEXT NOT NULL,
                store_name TEXT,
                search_vector tsvector GENERATED ALWAYS AS (
                    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, ''))
                ) STORED
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_retail_search
            ON retail_products USING GIN(search_vector)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_retail_sku ON retail_products(sku)
            WHERE sku IS NOT NULL AND sku != ''
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_retail_platform ON retail_products(platform)
        """))
        conn.commit()

run_migrations()

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
    if request.url.path in ("/health", "/snapshot"):
        return await call_next(request)

    origin = request.headers.get("origin", "")
    api_key = request.headers.get("x-api-key", "")

    if not origin and API_KEY and api_key != API_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

    return await call_next(request)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(search.router)
app.include_router(restaurants.router)
app.include_router(snapshots.router)
app.include_router(retail.router)

@app.get("/health")
def health():
    return {"status": "ok", "version": "retail-v1"}
