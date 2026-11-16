#!/usr/bin/env python3
import json
import os
import sys

def main():
    registry_file = sys.argv[1]
    release_tag = sys.argv[2]
    repo_owner = sys.argv[3]
    repo_name = sys.argv[4]

    with open(registry_file, "r", encoding="utf-8") as f:
        registry_data = json.load(f)

    if "addons" not in registry_data:
        registry_data["addons"] = []

    # Map existing addons by ID
    existing = {a["id"]: a for a in registry_data["addons"]}

    packages_dir = "packages"
    if not os.path.exists(packages_dir):
        print(f"Directory {packages_dir} not found")
        sys.exit(1)

    for item in sorted(os.listdir(packages_dir)):
        item_path = os.path.join(packages_dir, item)
        if not os.path.isdir(item_path):
            continue

        manifest_file = os.path.join(item_path, "addon.json")
        zip_file = f"dist-zips/{item}.zip"
        sha_file = f"dist-zips/{item}.zip.sha256"

        if not os.path.exists(manifest_file) or not os.path.exists(zip_file):
            print(f"Skipping {item}: manifest or zip missing")
            continue

        with open(manifest_file, "r", encoding="utf-8") as mf:
            manifest = json.load(mf)

        sha256 = ""
        if os.path.exists(sha_file):
            with open(sha_file, "r", encoding="utf-8") as sf:
                sha256 = sf.read().strip()

        download_url = f"https://github.com/{repo_owner}/{repo_name}/releases/download/{release_tag}/{item}.zip"

        addon_entry = {
            "id": manifest.get("id"),
            "name": manifest.get("name"),
            "version": manifest.get("version"),
            "runtime": manifest.get("runtime", "backend"),
            "description": manifest.get("description", ""),
            "download_url": download_url,
            "sha256": sha256,
            "manifest": manifest
        }

        existing[manifest["id"]] = addon_entry
        print(f"Registered addon: {manifest['id']} (v{manifest['version']})")

    registry_data["addons"] = list(existing.values())

    from datetime import datetime, timezone
    registry_data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with open(registry_file, "w", encoding="utf-8") as f:
        json.dump(registry_data, f, indent=2)
        f.write("\n")

    print(f"Successfully updated {registry_file} with {len(registry_data['addons'])} addons.")

if __name__ == "__main__":
    main()
