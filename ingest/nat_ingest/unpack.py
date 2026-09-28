"""Unzip the supplier ZIPs from NAT_SOURCE into .cache/raw/<folder>/."""
import zipfile

from .paths import RAW, SOURCE


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    zips = sorted(SOURCE.glob("*.zip"))
    if not zips:
        raise SystemExit(f"No ZIP files found in {SOURCE}")
    for z in zips:
        with zipfile.ZipFile(z) as zf:
            for info in zf.infolist():
                # Drive ZIPs store UTF-8 names without the flag; recover Thai filenames.
                name = info.filename
                if not info.flag_bits & 0x800:
                    try:
                        name = name.encode("cp437").decode("utf-8")
                    except (UnicodeEncodeError, UnicodeDecodeError):
                        pass
                target = RAW / name
                if info.is_dir():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists() or target.stat().st_size != info.file_size:
                    target.write_bytes(zf.read(info))
        print(f"unpacked {z.name}")


if __name__ == "__main__":
    main()
