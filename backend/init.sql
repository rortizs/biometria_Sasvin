-- Enable PostGIS extension (for geolocation-based fraud detection)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: We use FLOAT8[] arrays for face embeddings instead of pgvector
-- pgvector is for performance optimization with millions of vectors
-- For <10,000 employees, native PostgreSQL arrays are sufficient
