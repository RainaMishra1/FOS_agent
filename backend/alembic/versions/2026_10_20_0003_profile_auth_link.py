"""link application profiles to Supabase Auth users

Revision ID: 0003_profile_auth_link
Revises: 0002_agent_loc
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003_profile_auth_link"
down_revision: Union[str, None] = "0002_agent_loc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("auth_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.create_index(
        "ix_profiles_auth_user_id",
        "profiles",
        ["auth_user_id"],
        unique=True,
        schema="public",
    )
    op.create_foreign_key(
        "fk_profiles_auth_user_id_auth_users",
        "profiles",
        "users",
        ["auth_user_id"],
        ["id"],
        source_schema="public",
        referent_schema="auth",
        ondelete="SET NULL",
    )

    # Link only one-to-one email matches to confirmed Auth users. Keep all
    # application Profile IDs and Agent foreign keys unchanged.
    op.execute(sa.text("""
        WITH candidate_links AS (
            SELECT p.id AS profile_id, u.id AS auth_user_id,
                   count(*) OVER (PARTITION BY p.id) AS profile_matches,
                   count(*) OVER (PARTITION BY u.id) AS auth_matches
            FROM public.profiles AS p
            JOIN auth.users AS u
              ON lower(trim(p.email)) = lower(trim(u.email))
            WHERE p.email IS NOT NULL
              AND u.email_confirmed_at IS NOT NULL
              AND p.auth_user_id IS NULL
        )
        UPDATE public.profiles AS p
           SET auth_user_id = candidate_links.auth_user_id
          FROM candidate_links
         WHERE p.id = candidate_links.profile_id
           AND candidate_links.profile_matches = 1
           AND candidate_links.auth_matches = 1
           AND NOT EXISTS (
               SELECT 1 FROM public.profiles AS other
                WHERE other.auth_user_id = candidate_links.auth_user_id
           )
    """))


def downgrade() -> None:
    op.drop_constraint(
        "fk_profiles_auth_user_id_auth_users",
        "profiles",
        schema="public",
        type_="foreignkey",
    )
    op.drop_index("ix_profiles_auth_user_id", table_name="profiles", schema="public")
    op.drop_column("profiles", "auth_user_id", schema="public")
