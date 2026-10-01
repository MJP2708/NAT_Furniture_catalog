"""Sync catalogue images and PDFs to Neon Object Storage (bucket "nat-media").

  public/media/<path>  -> nat-media/<path>   (p/..., photo/..., brands/..., catalogue/*.pdf)

Only new or changed files are uploaded (compared by MD5 against the object's ETag); objects
whose local file is gone are deleted. Credentials come from .env.local (AWS_* variables).

Usage: python -m nat_ingest.upload [--dry-run]
"""
from __future__ import annotations

import hashlib
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config
from dotenv import load_dotenv

from .paths import MEDIA, ROOT

BUCKET = "nat-media"


def client():
    load_dotenv(ROOT / ".env.local")
    return boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        endpoint_url=os.environ["AWS_ENDPOINT_URL_S3"],
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 8, "mode": "adaptive"},
                      max_pool_connections=32),
    )


def local_files() -> dict[str, str]:
    return {str(p.relative_to(MEDIA)): str(p) for p in MEDIA.rglob("*") if p.is_file()}


def remote_etags(s3) -> dict[str, str]:
    out: dict[str, str] = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET):
        for o in page.get("Contents", []):
            out[o["Key"]] = o["ETag"].strip('"')
    return out


def main() -> None:
    dry = "--dry-run" in sys.argv
    s3 = client()
    local = local_files()
    remote = remote_etags(s3)

    def md5(path: str) -> str:
        return hashlib.md5(open(path, "rb").read()).hexdigest()

    todo = [(k, p) for k, p in local.items() if remote.get(k) != md5(p)]
    stale = [k for k in remote if k not in local and k != "healthcheck.txt"]
    print(f"{len(local)} local files · {len(remote)} in bucket · {len(todo)} to upload · {len(stale)} to delete")
    if dry:
        return

    def put(item: tuple[str, str]) -> None:
        key, path = item
        ctype = mimetypes.guess_type(path)[0] or ("image/webp" if path.endswith(".webp") else "application/octet-stream")
        with open(path, "rb") as f:
            s3.put_object(Bucket=BUCKET, Key=key, Body=f, ContentType=ctype,
                          # images/PDFs change only when the catalogue is rebuilt
                          CacheControl="public, max-age=86400")

    done = 0
    with ThreadPoolExecutor(16) as ex:
        for _ in ex.map(put, todo):
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(todo)}", flush=True)
    for i in range(0, len(stale), 1000):
        s3.delete_objects(Bucket=BUCKET, Delete={"Objects": [{"Key": k} for k in stale[i:i + 1000]]})
    print(f"uploaded {len(todo)}, deleted {len(stale)}")


if __name__ == "__main__":
    main()
