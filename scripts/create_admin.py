"""
Creates (or promotes) an administrator account. Used in production, where demo users are not seeded.

    python scripts/create_admin.py --username alice --email alice@example.org --name "Alice K"
    # the password is read from ADMIN_PASSWORD, or prompted for if that is not set

In Docker:  docker compose exec api python scripts/create_admin.py --username alice --email alice@example.org
"""
import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.core.security import hash_password  # noqa: E402
from backend.app.services import users  # noqa: E402

MIN_LENGTH = 12


def main() -> int:
    ap = argparse.ArgumentParser(description="Create or promote a YieldSense administrator.")
    ap.add_argument("--username", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", default="")
    args = ap.parse_args()

    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Password: ")
    if len(password) < MIN_LENGTH:
        print(f"Password must be at least {MIN_LENGTH} characters.", file=sys.stderr)
        return 2

    existing = users.get_user(args.username)
    if existing:
        users.update_user(args.username, role="Admin", hashed_password=hash_password(password), hash_scheme="bcrypt", active=True)
        print(f"Updated {args.username}: role Admin, password reset.")
    else:
        users.create_user(args.username, args.email, hash_password(password), "Admin", args.name or args.username)
        print(f"Created administrator {args.username}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
