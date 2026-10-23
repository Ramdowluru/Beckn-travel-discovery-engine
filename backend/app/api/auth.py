import asyncio

from argon2 import PasswordHasher
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)
from argon2.low_level import Type
from fastapi import APIRouter, HTTPException, status

from app.core.database import get_db
from app.repositories.users import DuplicateEmailError, UserRepository, to_public_user
from app.schemas.auth import PublicUser, SigninRequest, SignupRequest, SignupResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
password_hasher = PasswordHasher(type=Type.ID)


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(payload: SignupRequest) -> SignupResponse:
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
async def signin(payload: SigninRequest) -> SignupResponse:
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
    return SignupResponse(user=PublicUser(**public_user))
