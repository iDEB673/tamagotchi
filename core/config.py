from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    bot_token: str
    database_url: str
    webapp_url: str = ""
    proxy_url: str = ""  # для локалки, на сервере пустой


settings = Settings()