import secrets
from hmac import compare_digest

from fastapi import HTTPException, Request, status

from app.core.config import settings

SESSION_COOKIE = "tde_session"
HOST_SESSION_COOKIE = "__Host-tde_session"
CSRF_COOKIE = "tde_csrf"
CSRF_HEADER = "X-CSRF-Token"
ACCESS_TOKEN_COOKIE = "tde_access_token"
HOST_ACCESS_TOKEN_COOKIE = "__Host-tde_access_token"
REFRESH_TOKEN_COOKIE = "tde_refresh_token"
HOST_REFRESH_TOKEN_COOKIE = "__Host-tde_refresh_token"


def trusted_origin(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return False
    configured = {
        value.strip().rstrip("/")
        for value in settings.trusted_origins.split(",")
        if value.strip()
    }
    return origin.rstrip("/") in configured


def require_browser_write(request: Request) -> str:
    if not trusted_origin(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Untrusted request origin.",
        )

    cookie_token = request.cookies.get(CSRF_COOKIE)
    header_token = request.headers.get(CSRF_HEADER)
    if (
        not cookie_token
        or not header_token
        or not compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed.",
        )
    return cookie_token


def request_is_https(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "")
    return request.url.scheme == "https" or forwarded.split(",", 1)[0].strip() == "https"


def session_cookie_name(request: Request) -> str:
    return HOST_SESSION_COOKIE if request_is_https(request) else SESSION_COOKIE


def access_token_cookie_name(request: Request) -> str:
    return HOST_ACCESS_TOKEN_COOKIE if request_is_https(request) else ACCESS_TOKEN_COOKIE


def refresh_token_cookie_name(request: Request) -> str:
    return HOST_REFRESH_TOKEN_COOKIE if request_is_https(request) else REFRESH_TOKEN_COOKIE


def session_token(request: Request) -> str | None:
    """Extract session token from cookies (legacy support)."""
    return request.cookies.get(HOST_SESSION_COOKIE) or request.cookies.get(SESSION_COOKIE)


def access_token(request: Request) -> str | None:
    """Extract JWT access token from cookies."""
    return request.cookies.get(HOST_ACCESS_TOKEN_COOKIE) or request.cookies.get(ACCESS_TOKEN_COOKIE)


def refresh_token(request: Request) -> str | None:
    """Extract refresh token from cookies."""
    return request.cookies.get(HOST_REFRESH_TOKEN_COOKIE) or request.cookies.get(REFRESH_TOKEN_COOKIE)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)

