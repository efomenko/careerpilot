import os
import tempfile
from dataclasses import dataclass
from pathlib import Path


class ConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    temp_dir: Path


def validate_temp_dir(value: str) -> Path:
    try:
        path = Path(value).expanduser()
        if not value.strip() or not path.is_absolute():
            raise ConfigurationError("Temporary directory must be an absolute path.")
        path = path.resolve()
        public_root = Path(__file__).resolve().parents[2]
        if path == public_root or public_root in path.parents:
            raise ConfigurationError("Temporary directory must be outside the frontend tree.")
        if path.exists() and not path.is_dir():
            raise ConfigurationError("Temporary directory must be a directory.")
    except (OSError, RuntimeError, ValueError) as error:
        if isinstance(error, ConfigurationError):
            raise
        raise ConfigurationError("Temporary directory configuration is invalid.") from None
    return path


def load_settings() -> Settings:
    value = os.environ.get(
        "CAREERPILOT_TEMP_DIR",
        str(Path(tempfile.gettempdir()) / "careerpilot"),
    )
    return Settings(temp_dir=validate_temp_dir(value))
