import os
import re
import secrets

from .config import ConfigurationError, Settings, validate_temp_dir


class TemporaryStorageError(Exception):
    pass


class TemporaryStorage:
    def __init__(self, settings: Settings):
        self._directory = validate_temp_dir(str(settings.temp_dir))
        self._owned: set[str] = set()

    def _check_directory(self) -> None:
        try:
            if validate_temp_dir(str(self._directory)) != self._directory:
                raise TemporaryStorageError("Temporary directory changed.")
        except ConfigurationError:
            raise TemporaryStorageError("Temporary directory is unavailable.") from None

    def save(self, data: bytes) -> str:
        if not isinstance(data, bytes):
            raise TypeError("Temporary data must be bytes.")
        self._check_directory()
        name = f"{secrets.token_hex(32)}.tmp"
        path = self._directory / name
        created = False
        try:
            self._directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            self._check_directory()
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            created = True
            with os.fdopen(descriptor, "wb") as file:
                file.write(data)
        except OSError:
            if created:
                try:
                    path.unlink()
                except OSError:
                    raise TemporaryStorageError(
                        "Temporary data could not be saved or cleaned up."
                    ) from None
            raise TemporaryStorageError("Temporary data could not be saved.") from None
        self._owned.add(name)
        return name

    def delete(self, name: str) -> None:
        if (
            not isinstance(name, str)
            or re.fullmatch(r"[0-9a-f]{64}\.tmp", name) is None
            or name not in self._owned
        ):
            raise TemporaryStorageError("Invalid temporary file identifier.")
        self._check_directory()
        try:
            (self._directory / name).unlink()
        except OSError:
            raise TemporaryStorageError("Temporary data could not be deleted.") from None
        self._owned.remove(name)
