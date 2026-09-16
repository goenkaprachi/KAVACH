import uuid
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    encrypt_data,
    decrypt_data,
)


def test_password_hashing():
    raw = "SecureSecret123!"
    hashed = get_password_hash(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_generation_and_decoding():
    uid = str(uuid.uuid4())
    token = create_access_token({"sub": uid, "role": "admin"})
    payload = decode_token(token)
    
    assert payload is not None
    assert payload["sub"] == uid
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_fernet_encryption_at_rest():
    secret_text = "sk-super-secret-api-key-12345"
    encrypted = encrypt_data(secret_text)
    assert encrypted != secret_text
    decrypted = decrypt_data(encrypted)
    assert decrypted == secret_text
