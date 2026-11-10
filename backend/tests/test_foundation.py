import logging
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import ConfigurationError, Settings, load_settings
from backend.app.main import create_app
from backend.app.temp_storage import TemporaryStorage, TemporaryStorageError


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("CAREERPILOT_TEMP_DIR", str(tmp_path / "private"))
    return TestClient(create_app())


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_placeholder_does_not_store_or_process_content(client, tmp_path):
    response = client.post(
        "/api/imports",
        files={"file": ("fictional.pdf", b"synthetic CV content", "application/pdf")},
    )
    assert response.status_code == 501
    assert response.json() == {"detail": "CV import is not implemented."}
    assert not (tmp_path / "private").exists()
    assert client.app.openapi()["paths"]["/api/imports"]["post"]["responses"]["501"]


@pytest.mark.parametrize("value", ["", "relative/private"])
def test_invalid_relative_or_empty_configuration_is_sanitized(monkeypatch, value):
    monkeypatch.setenv("CAREERPILOT_TEMP_DIR", value)
    with pytest.raises(ConfigurationError) as error:
        load_settings()
    assert str(error.value)
    if value:
        assert value not in str(error.value)


def test_frontend_directory_and_child_are_rejected(monkeypatch):
    root = Path(__file__).resolve().parents[2]
    for path in (root, root / "private"):
        monkeypatch.setenv("CAREERPILOT_TEMP_DIR", str(path))
        with pytest.raises(ConfigurationError, match="outside the frontend tree"):
            load_settings()


def test_existing_file_is_not_a_valid_directory(monkeypatch, tmp_path):
    path = tmp_path / "sensitive-name"
    path.write_text("synthetic", encoding="utf-8")
    monkeypatch.setenv("CAREERPILOT_TEMP_DIR", str(path))
    with pytest.raises(ConfigurationError) as error:
        load_settings()
    assert str(path) not in str(error.value)


def test_resolved_directory_inside_frontend_is_rejected(monkeypatch, tmp_path):
    root = Path(__file__).resolve().parents[2]
    link = tmp_path / "link"
    original_resolve = Path.resolve

    def resolve(path, *args, **kwargs):
        if path == link:
            return root / "inside"
        return original_resolve(path, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", resolve)
    monkeypatch.setenv("CAREERPILOT_TEMP_DIR", str(link))
    with pytest.raises(ConfigurationError, match="outside the frontend tree"):
        load_settings()


def test_storage_creates_opaque_unique_files_and_cleans_up(tmp_path):
    directory = tmp_path / "private"
    storage = TemporaryStorage(Settings(directory))
    first = storage.save(b"synthetic first")
    second = storage.save(b"synthetic second")
    assert first != second
    assert len(first) == 68 and first.endswith(".tmp")
    assert (directory / first).read_bytes() == b"synthetic first"
    assert (directory / second).read_bytes() == b"synthetic second"
    storage.delete(first)
    assert not (directory / first).exists()
    assert (directory / second).exists()
    storage.delete(second)
    assert list(directory.iterdir()) == []


def test_storage_rejects_unowned_files_and_traversal(tmp_path):
    directory = tmp_path / "private"
    directory.mkdir()
    storage = TemporaryStorage(Settings(directory))
    outside = tmp_path / "unrelated.txt"
    outside.write_bytes(b"synthetic")
    unrelated = directory / ("a" * 64 + ".tmp")
    unrelated.write_bytes(b"synthetic")
    for name in ("../unrelated.txt", str(outside), unrelated.name):
        with pytest.raises(TemporaryStorageError):
            storage.delete(name)
    assert outside.read_bytes() == b"synthetic"
    assert unrelated.read_bytes() == b"synthetic"


def test_storage_refuses_frontend_directory():
    root = Path(__file__).resolve().parents[2]
    with pytest.raises(ConfigurationError):
        TemporaryStorage(Settings(root / "private"))


def test_storage_errors_do_not_reveal_paths(monkeypatch, tmp_path):
    storage = TemporaryStorage(Settings(tmp_path / "sensitive-path"))

    def fail(*args, **kwargs):
        raise OSError("sensitive-path secret synthetic content")

    monkeypatch.setattr(os, "open", fail)
    with pytest.raises(TemporaryStorageError) as error:
        storage.save(b"synthetic content")
    assert str(error.value) == "Temporary data could not be saved."
    assert error.value.__suppress_context__


def test_failed_write_removes_partially_created_file(monkeypatch, tmp_path):
    storage = TemporaryStorage(Settings(tmp_path))
    original_fdopen = os.fdopen

    class FailingWriter:
        def __init__(self, descriptor):
            self.file = original_fdopen(descriptor, "wb")

        def __enter__(self):
            return self

        def write(self, data):
            self.file.write(data)
            raise OSError("sensitive path")

        def __exit__(self, *args):
            self.file.close()

    monkeypatch.setattr(os, "fdopen", lambda descriptor, mode: FailingWriter(descriptor))
    with pytest.raises(TemporaryStorageError, match="could not be saved"):
        storage.save(b"synthetic")
    assert list(tmp_path.iterdir()) == []


def test_failed_delete_is_sanitized_and_can_be_retried(monkeypatch, tmp_path):
    storage = TemporaryStorage(Settings(tmp_path))
    name = storage.save(b"synthetic")
    original = Path.unlink

    def fail(path, *args, **kwargs):
        raise OSError(f"secret: {path}")

    with monkeypatch.context() as patch:
        patch.setattr(Path, "unlink", fail)
        with pytest.raises(TemporaryStorageError) as error:
            storage.delete(name)
        assert str(error.value) == "Temporary data could not be deleted."
        assert error.value.__suppress_context__
    assert Path.unlink is original
    storage.delete(name)
    assert not (tmp_path / name).exists()


def test_unexpected_error_is_sanitized_and_not_logged(client, caplog):
    @client.app.get("/test-error")
    async def fail():
        raise RuntimeError("secret sensitive-path synthetic CV content")

    with caplog.at_level(logging.ERROR):
        response = client.get("/test-error")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error."}
    assert "secret" not in response.text
    assert "secret" not in caplog.text
