"""Create initial core models for FOS application

Revision ID: 2026_10_19_0001
Revises: 
Create Date: 2026-10-19 01:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = '2026_10_19_0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Profiles table
    op.create_table(
        'profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, comment='Aligns with Supabase auth.users.id'),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='agent'),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_profiles_full_name'), 'profiles', ['full_name'], unique=False)
    op.create_index(op.f('ix_profiles_email'), 'profiles', ['email'], unique=True)

    # 2. Agents table
    op.create_table(
        'agents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('agent_code', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='active'),
        sa.Column('territory', sa.String(length=100), nullable=True),
        sa.Column('current_latitude', sa.Float(), nullable=True),
        sa.Column('current_longitude', sa.Float(), nullable=True),
        sa.Column(
            'current_location',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=True,
        ),
        sa.Column('battery_level', sa.Integer(), nullable=True),
        sa.Column('last_location_update', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['profile_id'], ['profiles.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('profile_id'),
    )
    op.create_index(op.f('ix_agents_profile_id'), 'agents', ['profile_id'], unique=True)
    op.create_index(op.f('ix_agents_agent_code'), 'agents', ['agent_code'], unique=True)
    op.create_index(op.f('ix_agents_status'), 'agents', ['status'], unique=False)

    # 3. Customers table
    op.create_table(
        'customers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('customer_code', sa.String(length=50), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=True),
        sa.Column('contact_person', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('address', sa.String(length=500), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=False, server_default='Bengaluru'),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column(
            'location',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=True,
        ),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_customers_customer_code'), 'customers', ['customer_code'], unique=True)
    op.create_index(op.f('ix_customers_name'), 'customers', ['name'], unique=False)

    # 4. Leads table
    op.create_table(
        'leads',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_code', sa.String(length=50), nullable=True),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('assigned_agent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('priority', sa.String(length=50), nullable=False, server_default='medium'),
        sa.Column('assignment_status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_agent_id'], ['agents.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_leads_customer_id'), 'leads', ['customer_id'], unique=False)
    op.create_index(op.f('ix_leads_assigned_agent_id'), 'leads', ['assigned_agent_id'], unique=False)
    op.create_index(op.f('ix_leads_lead_code'), 'leads', ['lead_code'], unique=True)
    op.create_index(op.f('ix_leads_priority'), 'leads', ['priority'], unique=False)
    op.create_index(op.f('ix_leads_assignment_status'), 'leads', ['assignment_status'], unique=False)

    # 5. Visits table
    op.create_table(
        'visits',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('visit_code', sa.String(length=50), nullable=True),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('scheduled_time', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('geofence_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('check_in_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('estimated_duration_minutes', sa.Integer(), nullable=False, server_default='45'),
        sa.Column('purpose', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='RESTRICT'),
    )
    op.create_index(op.f('ix_visits_customer_id'), 'visits', ['customer_id'], unique=False)
    op.create_index(op.f('ix_visits_agent_id'), 'visits', ['agent_id'], unique=False)
    op.create_index(op.f('ix_visits_scheduled_date'), 'visits', ['scheduled_date'], unique=False)
    op.create_index(op.f('ix_visits_status'), 'visits', ['status'], unique=False)
    op.create_index(op.f('ix_visits_visit_code'), 'visits', ['visit_code'], unique=True)

    # 6. Assignments table
    op.create_table(
        'assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('assignment_code', sa.String(length=50), nullable=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('assigned_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('scheduled_time', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='assigned'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_by_id'], ['profiles.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_assignments_lead_id'), 'assignments', ['lead_id'], unique=False)
    op.create_index(op.f('ix_assignments_agent_id'), 'assignments', ['agent_id'], unique=False)
    op.create_index(op.f('ix_assignments_assigned_by_id'), 'assignments', ['assigned_by_id'], unique=False)
    op.create_index(op.f('ix_assignments_scheduled_date'), 'assignments', ['scheduled_date'], unique=False)
    op.create_index(op.f('ix_assignments_status'), 'assignments', ['status'], unique=False)
    op.create_index(op.f('ix_assignments_assignment_code'), 'assignments', ['assignment_code'], unique=True)

    # 7. Agent Locations (breadcrumbs)
    op.create_table(
        'agent_locations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column(
            'location',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=True,
        ),
        sa.Column('gps_accuracy', sa.Float(), nullable=True),
        sa.Column('battery_level', sa.Integer(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
    )
    op.create_index(op.f('ix_agent_locations_agent_id'), 'agent_locations', ['agent_id'], unique=False)
    op.create_index(op.f('ix_agent_locations_recorded_at'), 'agent_locations', ['recorded_at'], unique=False)

    # 8. Visit Location Logs
    op.create_table(
        'visit_location_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('visit_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column(
            'location',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=True,
        ),
        sa.Column('accuracy_meters', sa.Float(), nullable=True),
        sa.Column('distance_to_customer_meters', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['visit_id'], ['visits.id'], ondelete='CASCADE'),
    )
    op.create_index(op.f('ix_visit_location_logs_visit_id'), 'visit_location_logs', ['visit_id'], unique=False)
    op.create_index(op.f('ix_visit_location_logs_event_type'), 'visit_location_logs', ['event_type'], unique=False)
    op.create_index(op.f('ix_visit_location_logs_recorded_at'), 'visit_location_logs', ['recorded_at'], unique=False)


def downgrade() -> None:
    op.drop_table('visit_location_logs')
    op.drop_table('agent_locations')
    op.drop_table('assignments')
    op.drop_table('visits')
    op.drop_table('leads')
    op.drop_table('customers')
    op.drop_table('agents')
    op.drop_table('profiles')
