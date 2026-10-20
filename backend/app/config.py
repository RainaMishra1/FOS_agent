from typing import List, Union, Optional
from pathlib import Path
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "FOS Agent Management System"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8000

    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        return v

    CORS_ORIGIN_REGEX: Optional[str] = r"https:\/\/.*\.vercel\.app"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/fos_agent"
    DIRECT_URL: str = "postgresql://postgres:postgres@localhost:5432/fos_agent"

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def assemble_database_url(cls, v: str) -> str:
        if v:
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Supabase Auth
    SUPABASE_URL: str = "https://placeholder.supabase.co"
    SUPABASE_JWT_SECRET: str = "change_me_in_production"
    SUPABASE_ANON_KEY: str = "placeholder_anon_key"
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    @field_validator("SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", mode="before")
    @classmethod
    def clean_secrets(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            return v.strip().strip('"').strip("'")
        return v

    @field_validator("SUPABASE_URL", mode="before")
    @classmethod
    def clean_supabase_url(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            return v.strip().strip('"').strip("'").rstrip("/")
        return v

    # Registration credentials are server-only. Admin email allowlisting is
    # mandatory in production, in addition to the independent admin key.
    ADMIN_REGISTRATION_KEY: Optional[str] = None
    AGENT_REGISTRATION_KEY: Optional[str] = None
    ADMIN_REGISTRATION_ALLOWLIST: List[str] = []

    @field_validator("ADMIN_REGISTRATION_ALLOWLIST", mode="before")
    @classmethod
    def assemble_admin_registration_allowlist(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and v.startswith("["):
            return [email.strip().lower() for email in json.loads(v)]
        if isinstance(v, str):
            return [email.strip().lower() for email in v.split(",") if email.strip()]
        return [email.strip().lower() for email in v]

    # Operational Parameters
    GEOFENCE_RADIUS_METERS: float = 100.0
    MAX_ACCEPTABLE_GPS_ACCURACY_METERS: float = 50.0
    LOCATION_STALE_THRESHOLD_SECONDS: int = 300
    OSRM_BASE_URL: str = "http://router.project-osrm.org"
    GEOCODING_SEARCH_URL: str = "https://nominatim.openstreetmap.org/search"
    GEOCODING_USER_AGENT: str = "FOS-Enterprise/1.0 (field operations address lookup)"

    model_config = SettingsConfigDict(
        env_file=(str(ENV_FILE), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

