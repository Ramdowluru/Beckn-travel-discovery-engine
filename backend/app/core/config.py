from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongo_url:str
    db_name:str
    gateway_url:str
    bap_id:str
    bap_uri:str
    search_timeout_seconds:float = 3

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
