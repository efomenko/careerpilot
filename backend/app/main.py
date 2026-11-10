from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import load_settings


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI()
    app.state.settings = settings

    @app.middleware("http")
    async def sanitized_errors(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            return JSONResponse(
                status_code=500, content={"detail": "Internal server error."}
            )

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post(
        "/api/imports",
        status_code=501,
        responses={501: {"description": "CV import is not implemented."}},
    )
    async def imports_placeholder():
        return JSONResponse(
            status_code=501, content={"detail": "CV import is not implemented."}
        )

    return app


app = create_app()
