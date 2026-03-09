#!/usr/bin/env python3
"""
Session Manager - OpenDesk AI
==============================

Tracks which services are active and provides quick context
for the AI coding agent about the current development session.

Usage:
    python .agent/scripts/session_manager.py .
"""

import sys
import json
from pathlib import Path
from datetime import datetime

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    ENDC = '\033[0m'

SERVICES = {
    "desktop_client": {"lang": "Rust + Tauri", "config": "Cargo.toml", "subpath": "src-tauri"},
    "gateway": {"lang": "Go", "config": "go.mod", "subpath": ""},
    "backend": {"lang": "Node.js + TS", "config": "package.json", "subpath": ""},
    "frontend": {"lang": "Next.js + TS", "config": "package.json", "subpath": ""},
}

def main():
    if len(sys.argv) < 2:
        print("Usage: session_manager.py <project_root>")
        sys.exit(1)

    project = Path(sys.argv[1]).resolve()

    print(f"{Colors.BOLD}{Colors.CYAN}🌐 OpenDesk AI - Session Info{Colors.ENDC}")
    print(f"   Project: {project}")
    print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    print(f"{Colors.BOLD}Services:{Colors.ENDC}")
    for name, info in SERVICES.items():
        svc_path = project / name
        sub = svc_path / info["subpath"] if info["subpath"] else svc_path
        config_path = sub / info["config"]

        if config_path.exists():
            print(f"  {Colors.GREEN}✅{Colors.ENDC} {name:20s} ({info['lang']})")
        elif svc_path.exists():
            print(f"  {Colors.YELLOW}⚠️{Colors.ENDC}  {name:20s} ({info['lang']}) - no {info['config']}")
        else:
            print(f"  {Colors.RED}❌{Colors.ENDC} {name:20s} ({info['lang']}) - directory missing")

    # Check infrastructure
    print(f"\n{Colors.BOLD}Infrastructure:{Colors.ENDC}")
    compose = project / "docker-compose.yml"
    if not compose.exists():
        compose = project / "docker-compose.yaml"
    print(f"  {'✅' if compose.exists() else '❌'} Docker Compose: {'found' if compose.exists() else 'not found'}")

    env_file = project / ".env"
    print(f"  {'✅' if env_file.exists() else '⚠️'}  .env file: {'found' if env_file.exists() else 'not found'}")

if __name__ == "__main__":
    main()
