import uvicorn
import os
import sys

if __name__ == "__main__":
    # Inject backend folder into Python search paths so imports work smoothly
    backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    sys.path.insert(0, backend_path)
    
    # Run Uvicorn server targeting app.main:app
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[os.path.join(backend_path, "app")]
    )
