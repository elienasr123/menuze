from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import search, restaurants

app = FastAPI(title="Menuze API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(restaurants.router)


@app.get("/health")
def health():
    return {"status": "ok"}
