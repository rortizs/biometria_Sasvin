-- Repair or create hidden bootstrap ADMIN from psql variables.
-- Usage:
--   psql \
--     -v BOOTSTRAP_ADMIN_EMAIL="$BOOTSTRAP_ADMIN_EMAIL" \
--     -v BOOTSTRAP_ADMIN_FULL_NAME="$BOOTSTRAP_ADMIN_FULL_NAME" \
--     -v BOOTSTRAP_ADMIN_PASSWORD_HASH="$BOOTSTRAP_ADMIN_PASSWORD_HASH" \
--     -f create_admin.sql

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

INSERT INTO roles (id, name, description, is_active, created_at, updated_at)
VALUES (uuid_generate_v4(), 'ADMIN', 'Hidden bootstrap system administrator', true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW();

INSERT INTO users (id, email, hashed_password, full_name, role, is_active, must_change_password, created_at, updated_at)
VALUES (
    uuid_generate_v4(),
    :'BOOTSTRAP_ADMIN_EMAIL',
    :'BOOTSTRAP_ADMIN_PASSWORD_HASH',
    :'BOOTSTRAP_ADMIN_FULL_NAME',
    'ADMIN',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE
SET hashed_password = EXCLUDED.hashed_password,
    full_name = EXCLUDED.full_name,
    role = 'ADMIN',
    is_active = true,
    must_change_password = true,
    updated_at = NOW();

INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by)
SELECT uuid_generate_v4(), u.id, r.id, NOW(), u.id
FROM users u
JOIN roles r ON r.name = 'ADMIN'
WHERE u.email = :'BOOTSTRAP_ADMIN_EMAIL'
ON CONFLICT (user_id, role_id) DO NOTHING;
