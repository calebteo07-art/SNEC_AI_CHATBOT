#!/usr/bin/env python3
"""Shared Supabase client — all Supabase operations go through here.

Provides a lazy singleton client and typed helpers for inserting documents,
chunks, images, and checklists.

Usage:
    from tools.kb.supabase_client import get_client, insert_document, insert_chunks

Self-test:
    python tools/kb/supabase_client.py
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

_client = None


def get_client():
    """Return a lazy singleton Supabase client."""
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env. "
            "Create a Supabase project at https://supabase.com and add the service role key."
        )

    from supabase import create_client
    _client = create_client(url, key)
    return _client


def insert_document(row: dict) -> str:
    """Upsert a document row. Returns the document UUID."""
    client = get_client()
    result = (
        client.table("documents")
        .upsert(row, on_conflict="filename")
        .execute()
    )
    return result.data[0]["id"]


def get_document_id(filename: str) -> str | None:
    """Return the existing document id for a filename, or None if not found."""
    client = get_client()
    result = (
        client.table("documents")
        .select("id")
        .eq("filename", filename)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None


def get_checklist_id(document_id: str) -> str | None:
    """Return the existing checklist id for a document_id, or None if not found."""
    client = get_client()
    result = (
        client.table("checklists")
        .select("id")
        .eq("document_id", document_id)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None


def insert_chunks(rows: list[dict]) -> None:
    """Batch-insert chunk rows. Each row must include document_id and embedding."""
    if not rows:
        return
    client = get_client()
    # Supabase has a 1 MB request limit — insert in batches of 50 chunks
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        client.table("chunks").insert(rows[i : i + batch_size]).execute()


def insert_images(rows: list[dict]) -> None:
    """Batch-insert image metadata rows."""
    if not rows:
        return
    client = get_client()
    client.table("images").insert(rows).execute()


def upsert_checklist(row: dict) -> None:
    """Upsert a checklist row (keyed by document_id)."""
    client = get_client()
    client.table("checklists").upsert(row, on_conflict="document_id").execute()


def upload_kb_image(storage_path: str, image_bytes: bytes) -> str:
    """Upload an image to the kb-images Supabase Storage bucket.

    Returns the public URL for the uploaded image.
    The bucket 'kb-images' must exist and be set to public in the Supabase dashboard.
    """
    client = get_client()
    client.storage.from_("kb-images").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/png", "upsert": "true"},
    )
    return client.storage.from_("kb-images").get_public_url(storage_path)


def upload_avatar(storage_path: str, image_bytes: bytes, content_type: str = "image/png") -> str:
    """Upload a Selena portrait to the public `selena-avatars` Storage bucket.

    Returns the public URL. `content_type` should match the bytes (flash-image returns
    JPEG). The bucket must exist and be set to public in the Supabase dashboard (RICOE v2
    · Selena 3D portrait). `upsert=true` so re-storing the same config-hash is idempotent.
    """
    client = get_client()
    client.storage.from_("selena-avatars").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return client.storage.from_("selena-avatars").get_public_url(storage_path)


if __name__ == "__main__":
    url = os.getenv("SUPABASE_URL", "")
    if not url:
        print("[SKIP] SUPABASE_URL not set — skipping live self-test.")
        print("  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to run the full test.")
        sys.exit(0)

    print("Testing supabase_client.py (live mode)...\n")
    client = get_client()
    print(f"  Connected to: {url}")

    # Quick connectivity check — list tables via documents query
    result = client.table("documents").select("id").limit(1).execute()
    print(f"  [OK] documents table accessible, row count sample: {len(result.data)}")

    print("\n[PASS] supabase_client.py connected successfully.")
    sys.exit(0)
