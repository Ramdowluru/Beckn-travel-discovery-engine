import asyncio

from argon2 import PasswordHasher
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)
from argon2.low_level import Type
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    CSRF_COOKIE,
    new_csrf_token,
    require_browser_write,
    access_token_cookie_name,
    refresh_token_cookie_name,
    access_token,
    refresh_token,
)
from app.core.jwt_utils import create_access_token, create_refresh_token, verify_access_token
from app.dependencies.auth import get_current_user
from app.repositories.refresh_tokens import (
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenRepository,
    RefreshTokenRevokedError,
)
from app.repositories.users import DuplicateEmailError, UserRepository, to_public_user
from app.schemas.auth import PublicUser, SigninRequest, SignupRequest, SignupResponse
import jwt

router = APIRouter(prefix="/api/auth", tags=["auth"])
password_hasher = PasswordHasher(type=Type.ID)


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
) -> SignupResponse:
    require_browser_write(request)
    password_hash = await asyncio.to_thread(password_hasher.hash, payload.password)

    try:
        user = await UserRepository(get_db()).create(
            name=payload.name,
            email=str(payload.email),
            password_hash=password_hash,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        ) from exc

    # Generate JWT access token
    access_jwt = create_access_token(user["_id"])
    
    # Generate and store refresh token
    refresh_tok, _ = await RefreshTokenRepository(
        get_db(),
        settings.jwt_refresh_token_expire_days,
    ).create(user_id=user["_id"])
    
    # Set cookies
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key=access_token_cookie_name(request),
        value=access_jwt,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=refresh_token_cookie_name(request),
        value=refresh_tok,
        max_age=settings.jwt_refresh_token_expire_days * 86400,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=new_csrf_token(),
        max_age=settings.session_lifetime_seconds,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )

    public_user = to_public_user(user)
    assert public_user is not None
    return SignupResponse(user=PublicUser(**public_user))


@router.post("/signin", response_model=SignupResponse)
async def signin(
    payload: SigninRequest,
    request: Request,
    response: Response,
) -> SignupResponse:
    require_browser_write(request)
    user = await UserRepository(get_db()).get_by_email(str(payload.email))
    stored_hash = user.get("passwordHash") if user else None

    if not isinstance(stored_hash, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    try:
        password_matches = await asyncio.to_thread(
            password_hasher.verify,
            stored_hash,
            payload.password,
        )
    except (InvalidHashError, VerifyMismatchError, VerificationError):
        password_matches = False

    if not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    public_user = to_public_user(user)
    assert public_user is not None
    
    # Revoke any existing refresh tokens for this user (logout previous sessions)
    await RefreshTokenRepository(
        get_db(),
        settings.jwt_refresh_token_expire_days,
    ).revoke_all_for_user(user_id=user["_id"])
    
    # Generate new JWT access token
    access_jwt = create_access_token(user["_id"])
    
    # Generate and store refresh token
    refresh_tok, _ = await RefreshTokenRepository(
        get_db(),
        settings.jwt_refresh_token_expire_days,
    ).create(user_id=user["_id"])
    
    # Set cookies
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key=access_token_cookie_name(request),
        value=access_jwt,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=refresh_token_cookie_name(request),
        value=refresh_tok,
        max_age=settings.jwt_refresh_token_expire_days * 86400,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=new_csrf_token(),
        max_age=settings.session_lifetime_seconds,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )
    
    return SignupResponse(user=PublicUser(**public_user))


@router.get("/csrf")
async def csrf(request: Request, response: Response):
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key=CSRF_COOKIE,
        value=request.cookies.get(CSRF_COOKIE) or new_csrf_token(),
        max_age=settings.session_lifetime_seconds,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )
    return {"ok": True}


@router.post("/refresh", response_model=SignupResponse)
async def refresh(
    request: Request,
    response: Response,
) -> SignupResponse:
    """Refresh the access token using the refresh token."""
    require_browser_write(request)
    refresh_tok = refresh_token(request)
    if not refresh_tok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required.",
        )

    try:
        token_doc = await RefreshTokenRepository(
            get_db(),
            settings.jwt_refresh_token_expire_days,
        ).get(token=refresh_tok)
    except (RefreshTokenNotFoundError, RefreshTokenExpiredError, RefreshTokenRevokedError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )

    # Get user document
    user = await UserRepository(get_db()).get_by_id(token_doc["userId"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    # Generate new access token
    access_jwt = create_access_token(user["_id"])
    
    # Set new access token cookie
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key=access_token_cookie_name(request),
        value=access_jwt,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )

    public_user = to_public_user(user)
    assert public_user is not None
    return SignupResponse(user=PublicUser(**public_user))


@router.get("/me", response_model=SignupResponse)
async def me(user: dict = Depends(get_current_user)) -> SignupResponse:
    public_user = to_public_user(user)
    assert public_user is not None
    return SignupResponse(user=PublicUser(**public_user))


@router.post("/logout")
async def logout(request: Request, response: Response):
    require_browser_write(request)
    refresh_tok = refresh_token(request)
    if refresh_tok:
        try:
            await RefreshTokenRepository(
                get_db(),
                settings.jwt_refresh_token_expire_days,
            ).revoke(token=refresh_tok)
        except Exception:
            pass

    # Delete all auth cookies
    response.delete_cookie(key="tde_session", path="/")
    response.delete_cookie(key="__Host-tde_session", path="/")
    response.delete_cookie(key="tde_access_token", path="/")
    response.delete_cookie(key="__Host-tde_access_token", path="/")
    response.delete_cookie(key="tde_refresh_token", path="/")
    response.delete_cookie(key="__Host-tde_refresh_token", path="/")
    response.delete_cookie(key=CSRF_COOKIE, path="/")
    return {"ok": True}

