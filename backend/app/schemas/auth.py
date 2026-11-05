from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    
    def name_must_not_be_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name must not be empty.")
        return value


class SigninRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class PublicUser(BaseModel):
    id: str
    name: str
    email: str


class SignupResponse(BaseModel):
    user: PublicUser
