import os
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .middleware.logging import RequestLoggingMiddleware, setup_cors
from .routes.api import router as api_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

app = FastAPI(
    title="Energy Bill OCR & LLM Scrapper",
    description="Extracts data from energy bills using OCR and organizes it using LLM.",
    version="1.0.0"
)

# Set up middlewares
app.add_middleware(RequestLoggingMiddleware)
setup_cors(app)

# Register endpoints
app.include_router(api_router)

# Resolve the frontend dist folder absolute path dynamically
# Location of this file is at: backend/app/main.py
# BASE_DIR should be: backend/app/main.py -> backend/app -> backend -> Energy_Bill_Scrapper
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")

# Mount SPA static files from frontend build output
if os.path.exists(FRONTEND_DIST_DIR):
    logger.info(f"Mounting static files from: {FRONTEND_DIST_DIR}")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="static")
else:
    logger.warning(
        f"Frontend dist directory not found at {FRONTEND_DIST_DIR}. "
        f"FastAPI will only serve the API endpoints. Build the frontend first if you need static files."
    )
