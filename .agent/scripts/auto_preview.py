#!/usr/bin/env python3
"""
Auto Preview - OpenDesk AI
===========================

Start/stop/check development servers for all OpenDesk AI services.
Uses Docker Compose by default, with fallback to local commands.

Usage:
    python .agent/scripts/auto_preview.py start
    python .agent/scripts/auto_preview.py stop
    python .agent/scripts/auto_preview.py status
"""

import sys
import subprocess
import shutil
from pathlib import Path

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    ENDC = '\033[0m'

def has_docker_compose() -> bool:
    """Check if docker compose is available."""
    return shutil.which("docker") is not None

def run_cmd(cmd: str, cwd: str = ".") -> tuple:
    """Run a command and return (success, output)."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, cwd=cwd, timeout=30
        )
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)

def start_services():
    """Start all OpenDesk AI services."""
    print(f"{Colors.BOLD}{Colors.CYAN}🚀 Starting OpenDesk AI services...{Colors.ENDC}\n")

    if has_docker_compose():
        success, output = run_cmd("docker compose up -d")
        if success:
            print(f"{Colors.GREEN}✅ All services started via Docker Compose{Colors.ENDC}")
            print(f"   📦 MongoDB:  localhost:27017")
            print(f"   📦 Redis:    localhost:6379")
            print(f"   🧠 Backend:  http://localhost:3001")
            print(f"   🌐 Gateway:  ws://localhost:8080")
            print(f"   🎨 Frontend: http://localhost:3000")
        else:
            print(f"{Colors.RED}❌ Docker Compose failed{Colors.ENDC}")
            print(output[:300])
    else:
        print(f"{Colors.YELLOW}⚠️  Docker not found. Start services manually:{Colors.ENDC}")
        print(f"   cd backend && npm run dev")
        print(f"   cd frontend && npm run dev")
        print(f"   cd gateway && go run main.go")
        print(f"   cd desktop_client && cargo run")

def stop_services():
    """Stop all services."""
    print(f"{Colors.BOLD}{Colors.CYAN}🛑 Stopping OpenDesk AI services...{Colors.ENDC}")
    if has_docker_compose():
        run_cmd("docker compose down")
        print(f"{Colors.GREEN}✅ All services stopped{Colors.ENDC}")
    else:
        print(f"{Colors.YELLOW}⚠️  Docker not found. Stop services manually.{Colors.ENDC}")

def check_status():
    """Check status of all services."""
    print(f"{Colors.BOLD}{Colors.CYAN}🌐 OpenDesk AI Service Status{Colors.ENDC}\n")
    if has_docker_compose():
        success, output = run_cmd("docker compose ps")
        if success:
            print(output)
        else:
            print(f"{Colors.YELLOW}No services running{Colors.ENDC}")
    else:
        print(f"{Colors.YELLOW}Docker not available. Check services manually.{Colors.ENDC}")

def main():
    if len(sys.argv) < 2:
        check_status()
        return

    command = sys.argv[1].lower()

    if command == "start":
        start_services()
    elif command == "stop":
        stop_services()
    elif command == "status":
        check_status()
    elif command == "restart":
        stop_services()
        start_services()
    else:
        print(f"Unknown command: {command}")
        print("Usage: auto_preview.py [start|stop|status|restart]")
        sys.exit(1)

if __name__ == "__main__":
    main()
