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

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
