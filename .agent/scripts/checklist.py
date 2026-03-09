#!/usr/bin/env python3
"""
Master Checklist Runner - OpenDesk AI
======================================

Orchestrates validation checks across all 4 microservices.

Usage:
    python .agent/scripts/checklist.py .              # Run all checks
    python .agent/scripts/checklist.py . --service backend  # Single service

Priority Order:
    P0: Security (no hardcoded secrets)
    P1: Lint & Type Check (all services)
    P2: Tests (all services)
    P3: Build (compile/bundle check)
"""

import sys
import subprocess
import argparse
from pathlib import Path
from typing import List, Optional

# ANSI colors
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(60)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}\n")

def print_step(text: str):
    print(f"{Colors.BOLD}{Colors.BLUE}🔄 {text}{Colors.ENDC}")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.ENDC}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.ENDC}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.ENDC}")

# Service definitions
SERVICES = {
    "backend": {
        "path": "backend",
        "language": "Node.js + TypeScript",
        "checks": [
            ("Security Scan", "grep -rn 'password\\|secret\\|api_key' --include='*.ts' --include='*.js' -l", False),
            ("TypeScript Check", "npx tsc --noEmit", True),
            ("Lint", "npm run lint", False),
            ("Tests", "npm test", True),
        ]
    },
    "frontend": {
        "path": "frontend",
        "language": "Next.js + TypeScript",
        "checks": [
            ("Security Scan", "grep -rn 'password\\|secret\\|api_key' --include='*.ts' --include='*.tsx' -l", False),
            ("TypeScript Check", "npx tsc --noEmit", True),
            ("Lint", "npm run lint", False),
            ("Tests", "npm test", True),
            ("Build", "npm run build", False),
        ]
    },
    "gateway": {
        "path": "gateway",
        "language": "Go",
        "checks": [
            ("Go Vet", "go vet ./...", True),
            ("Go Lint", "golangci-lint run", False),
            ("Tests", "go test ./...", True),
            ("Race Detection", "go test -race ./...", False),
            ("Build", "go build ./...", True),
        ]
    },
    "desktop_client": {
        "path": "desktop_client/src-tauri",
        "language": "Rust + Tauri",
        "checks": [
            ("Clippy", "cargo clippy -- -D warnings", True),
            ("Format Check", "cargo fmt -- --check", False),
            ("Tests", "cargo test", True),
            ("Build", "cargo build", True),
        ]
    },
}

def run_check(name: str, cmd: str, cwd: Path, required: bool) -> dict:
    """Run a validation check and capture results."""
    if not cwd.exists():
        print_warning(f"{name}: Service directory not found ({cwd}), skipping")
        return {"name": name, "passed": True, "skipped": True}

    print_step(f"Running: {name}")

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=300, cwd=str(cwd)
        )

        passed = result.returncode == 0

        if passed:
            print_success(f"{name}: PASSED")
        else:
            print_error(f"{name}: FAILED")
            if result.stderr:
                print(f"  Error: {result.stderr[:200]}")

        return {"name": name, "passed": passed, "skipped": False, "required": required}

    except subprocess.TimeoutExpired:
        print_error(f"{name}: TIMEOUT (>5 minutes)")
        return {"name": name, "passed": False, "skipped": False, "required": required}

    except Exception as e:
        print_error(f"{name}: ERROR - {str(e)}")
        return {"name": name, "passed": False, "skipped": False, "required": required}

def print_summary(results: List[dict]) -> bool:
    """Print final summary report."""
    print_header("📊 CHECKLIST SUMMARY")

    passed = sum(1 for r in results if r["passed"] and not r.get("skipped"))
    failed = sum(1 for r in results if not r["passed"] and not r.get("skipped"))
    skipped = sum(1 for r in results if r.get("skipped"))

    print(f"Total: {len(results)} | {Colors.GREEN}✅ {passed}{Colors.ENDC} | {Colors.RED}❌ {failed}{Colors.ENDC} | {Colors.YELLOW}⏭️ {skipped}{Colors.ENDC}")
    print()

    for r in results:
        if r.get("skipped"):
            icon = f"{Colors.YELLOW}⏭️{Colors.ENDC}"
        elif r["passed"]:
            icon = f"{Colors.GREEN}✅{Colors.ENDC}"
        else:
            icon = f"{Colors.RED}❌{Colors.ENDC}"
        print(f"{icon} {r['name']}")

    print()
    if failed > 0:
        print_error(f"{failed} check(s) FAILED")
        return False
    else:
        print_success("All checks PASSED ✨")
        return True

def main():
    parser = argparse.ArgumentParser(description="OpenDesk AI - Master Checklist Runner")
    parser.add_argument("project", help="Project root path")
    parser.add_argument("--service", help="Run checks for a single service (backend, frontend, gateway, desktop_client)")
    args = parser.parse_args()

    project_path = Path(args.project).resolve()
    if not project_path.exists():
        print_error(f"Project path does not exist: {project_path}")
        sys.exit(1)

    print_header("🌐 OPENDESK AI - MASTER CHECKLIST")
    print(f"Project: {project_path}")

    services_to_check = {args.service: SERVICES[args.service]} if args.service else SERVICES
    results = []

    for service_name, service_config in services_to_check.items():
        service_path = project_path / service_config["path"]
        print_header(f"📋 {service_name.upper()} ({service_config['language']})")

        for check_name, cmd, required in service_config["checks"]:
            result = run_check(f"[{service_name}] {check_name}", cmd, service_path, required)
            results.append(result)

            if required and not result["passed"] and not result.get("skipped"):
                print_error(f"CRITICAL: {check_name} failed for {service_name}. Stopping.")
                print_summary(results)
                sys.exit(1)

    all_passed = print_summary(results)
    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
