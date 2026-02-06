-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable PostGIS extension (for geolocation features)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
