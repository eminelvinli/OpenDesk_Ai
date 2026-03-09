#!/usr/bin/env python3
"""
Verify All - OpenDesk AI
========================

Quick verification script that checks all 4 services have valid structure
and can compile/build successfully.

Usage:
    python .agent/scripts/verify_all.py .
"""

import sys
import subprocess
from pathlib import Path

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    ENDC = '\033[0m'

SERVICES = [
    {
        "name": "Backend",
        "path": "backend",
        "check_files": ["package.json", "tsconfig.json"],
        "verify_cmd": "npx tsc --noEmit",
    },
    {
        "name": "Frontend",
        "path": "frontend",
        "check_files": ["package.json", "next.config.js", "next.config.ts", "next.config.mjs"],
        "verify_cmd": "npx tsc --noEmit",
    },
    {
        "name": "Gateway",
        "path": "gateway",
        "check_files": ["go.mod", "main.go"],
        "verify_cmd": "go build ./...",
    },
    {
        "name": "Desktop Client",
        "path": "desktop_client/src-tauri",
        "check_files": ["Cargo.toml"],
        "verify_cmd": "cargo check",
    },
]

def main():
    if len(sys.argv) < 2:
        print("Usage: python verify_all.py <project_root>")
        sys.exit(1)

    project = Path(sys.argv[1]).resolve()
    print(f"{Colors.BOLD}{Colors.CYAN}🌐 OpenDesk AI - Verify All Services{Colors.ENDC}\n")

    results = []

    for svc in SERVICES:
        svc_path = project / svc["path"]
        print(f"{Colors.BOLD}📦 {svc['name']} ({svc['path']}){Colors.ENDC}")

        if not svc_path.exists():
            print(f"  {Colors.YELLOW}⏭️  Directory not found, skipping{Colors.ENDC}")
            results.append((svc["name"], "skipped"))
            continue

        # Check for required files (at least one must exist)
        found = any((svc_path / f).exists() for f in svc["check_files"])
        if not found:
            print(f"  {Colors.YELLOW}⚠️  No config files found ({', '.join(svc['check_files'])}){Colors.ENDC}")
            results.append((svc["name"], "no_config"))
            continue

        # Run verify command
        try:
            result = subprocess.run(
                svc["verify_cmd"], shell=True, capture_output=True,
                text=True, timeout=120, cwd=str(svc_path)
            )
            if result.returncode == 0:
                print(f"  {Colors.GREEN}✅ Verified{Colors.ENDC}")
                results.append((svc["name"], "passed"))
            else:
                print(f"  {Colors.RED}❌ Failed{Colors.ENDC}")
                if result.stderr:
                    print(f"     {result.stderr[:150]}")
                results.append((svc["name"], "failed"))
        except Exception as e:
            print(f"  {Colors.RED}❌ Error: {e}{Colors.ENDC}")
            results.append((svc["name"], "error"))

    # Summary
    print(f"\n{Colors.BOLD}Summary:{Colors.ENDC}")
    failed = sum(1 for _, status in results if status in ("failed", "error"))
    for name, status in results:
        icon = {"passed": "✅", "skipped": "⏭️", "no_config": "⚠️"}.get(status, "❌")
        print(f"  {icon} {name}: {status}")

    sys.exit(1 if failed > 0 else 0)

if __name__ == "__main__":
    main()
