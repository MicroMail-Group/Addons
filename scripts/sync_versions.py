#!/usr/bin/env python3
import json
import os
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: sync_versions.py <release_tag>")
        return

    tag = sys.argv[1].strip()
    clean_ver = tag.lstrip("v")
    if not clean_ver or clean_ver.startswith("0.0.0-"):
        print(f"Skipping sync for non-semver tag: {tag}")
        return

    packages_dir = "packages"
    if not os.path.exists(packages_dir):
        print(f"Directory {packages_dir} not found")
        return

    print(f"Syncing all addon manifests to version: {clean_ver}")
    for item in sorted(os.listdir(packages_dir)):
        manifest_file = os.path.join(packages_dir, item, "addon.json")
        if os.path.isfile(manifest_file):
            try:
                with open(manifest_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["version"] = clean_ver
                with open(manifest_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                    f.write("\n")
                print(f"  Updated {manifest_file} -> v{clean_ver}")
            except Exception as e:
                print(f"  Error updating {manifest_file}: {e}")

if __name__ == "__main__":
    main()
