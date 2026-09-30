"""query indexes

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-30 15:51:56.140883
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id'], unique=False, postgresql_where=sa.text('read_at IS NULL'))
    op.create_index('ix_predictions_created', 'predictions', ['created_at'], unique=False)
    op.create_index('ix_rec_actions_user_updated', 'recommendation_actions', ['user_id', 'updated_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_rec_actions_user_updated', table_name='recommendation_actions')
    op.drop_index('ix_predictions_created', table_name='predictions')
    op.drop_index('ix_notifications_user_unread', table_name='notifications', postgresql_where=sa.text('read_at IS NULL'))
