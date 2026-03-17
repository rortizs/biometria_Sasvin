-- SQL script to create admin user directly in PostgreSQL
-- Password: Admin2024! (bcrypt hash)

-- First, check if user exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@sistemaslab.dev') THEN
        INSERT INTO users (
            email,
            username,
            password_hash,
            full_name,
            role,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            'admin@sistemaslab.dev',
            'admin',
            '$2b$12$YGqKQ7hC3M.zEhzhHDpDOugFxD5fPqSJvZ0k8nMoKfXJsN9gH.Cfu',  -- bcrypt hash of Admin2024!
            'System Administrator',
            'admin',
            true,
            NOW(),
            NOW()
        );
        RAISE NOTICE 'Admin user created successfully!';
    ELSE
        RAISE NOTICE 'Admin user already exists.';
    END IF;
END $$;