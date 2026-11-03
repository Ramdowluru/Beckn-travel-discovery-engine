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
    session_cookie_name,
    session_token,
)
from app.dependencies.auth import get_current_user
from app.repositories.sessions import (
    SessionExpiredError,
    SessionNotFoundError,
    SessionRepository,
    SessionRevokedError,
)
from app.repositories.users import DuplicateEmailError, UserRepository, to_public_user
from app.schemas.auth import PublicUser, SigninRequest, SignupRequest, SignupResponse

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
    sessions = SessionRepository(get_db(), settings.session_lifetime_seconds)
    previous_token = session_token(request)
    if previous_token:
        try:
            await sessions.get(token=previous_token)
        except (SessionNotFoundError, SessionExpiredError, SessionRevokedError):
            pass
        else:
            await sessions.revoke(token=previous_token)
    token, _ = await sessions.create(user_id=user["_id"])
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key=session_cookie_name(request),
        value=token,
        max_age=settings.session_lifetime_seconds,
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


@router.get("/me", response_model=SignupResponse)
async def me(user: dict = Depends(get_current_user)) -> SignupResponse:
    public_user = to_public_user(user)
    assert public_user is not None
    return SignupResponse(user=PublicUser(**public_user))


@router.post("/logout")
async def logout(request: Request, response: Response):
    require_browser_write(request)
    token = session_token(request)
    if token:
        await SessionRepository(
            get_db(),
            settings.session_lifetime_seconds,
        ).revoke(token=token)

    response.delete_cookie(key="tde_session", path="/")
    response.delete_cookie(key="__Host-tde_session", path="/")
    response.delete_cookie(key=CSRF_COOKIE, path="/")
    return {"ok": True}
