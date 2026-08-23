"""
Idempotent script to create a read-only database user.
Runs once at container startup, before the API server starts.
"""
import os
import psycopg

READONLY_USER = os.environ.get("READONLY_DB_USER", "readonly_user")
READONLY_PASSWORD = os.environ.get("READONLY_DB_PASSWORD")
DATABASE_URL = os.environ.get("DATABASE_URL")

def setup_readonly_user() -> None:
    if not READONLY_PASSWORD:
        print("[setup_readonly] READONLY_DB_PASSWORD not set, skipping.")
        return

    # Connect as the superuser (DATABASE_URL uses the owner/superuser role)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            # Create role if it does not exist
            cur.execute(
                "SELECT 1 FROM pg_roles WHERE rolname = %s",
                (READONLY_USER,),
            )
            if cur.fetchone() is None:
                cur.execute(
                    f"CREATE USER {READONLY_USER} WITH PASSWORD %s",
                    (READONLY_PASSWORD,),
                )
                print(f"[setup_readonly] Created user {READONLY_USER!r}")
            else:
                # Always refresh the password in case it changed
                cur.execute(
                    f"ALTER USER {READONLY_USER} WITH PASSWORD %s",
                    (READONLY_PASSWORD,),
                )
                print(f"[setup_readonly] User {READONLY_USER!r} already exists, password updated.")

            db_name = conn.info.dbname
            cur.execute(f"GRANT CONNECT ON DATABASE {db_name} TO {READONLY_USER}")
            cur.execute(f"GRANT USAGE ON SCHEMA public TO {READONLY_USER}")
            cur.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO {READONLY_USER}")
            cur.execute(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                f"GRANT SELECT ON TABLES TO {READONLY_USER}"
            )
            print(f"[setup_readonly] Privileges granted to {READONLY_USER!r}")

if __name__ == "__main__":
    setup_readonly_user()
