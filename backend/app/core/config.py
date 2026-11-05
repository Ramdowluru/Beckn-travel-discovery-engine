from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongo_url:str
    db_name:str
    gateway_url:str
    bap_id:str
    bap_uri:str
    search_timeout_seconds:float = 3
    transport_snapshot_ttl_seconds:int = 900
    session_lifetime_seconds:int = 604800
    trusted_origins:str = "http://localhost:3000,http://127.0.0.1:3000"
    
    # JWT settings
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
    jwt_algorithm: str = "HS256"

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
