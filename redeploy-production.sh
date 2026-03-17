#!/bin/bash

# Redeploy script for Biometria System
# This script rebuilds the frontend for production and updates backend settings

echo "🚀 Starting production redeployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Rebuild frontend for production
echo -e "${YELLOW}📦 Building frontend for production...${NC}"
cd frontend
npm run build:prod
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend built successfully${NC}"
else
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
fi
cd ..

# Step 2: Update backend .env to use production settings
echo -e "${YELLOW}🔧 Updating backend environment...${NC}"
cp backend/.env.production backend/.env
echo -e "${GREEN}✅ Backend .env updated${NC}"

# Step 3: Build Docker images
echo -e "${YELLOW}🐳 Building Docker images...${NC}"
docker-compose build --no-cache
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker images built successfully${NC}"
else
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

# Step 4: Push to registry (if using Dokploy's registry)
echo -e "${YELLOW}📤 Pushing images to registry...${NC}"
# Note: Adjust these commands based on your Dokploy setup
# docker tag biometria_frontend dokploy-registry:5000/biometria_frontend:latest
# docker tag biometria_api dokploy-registry:5000/biometria_api:latest
# docker push dokploy-registry:5000/biometria_frontend:latest
# docker push dokploy-registry:5000/biometria_api:latest

echo -e "${GREEN}✅ Images ready for deployment${NC}"

# Step 5: Instructions for Dokploy deployment
echo -e "${YELLOW}📋 Next steps in Dokploy:${NC}"
echo "1. Go to Dokploy dashboard in LXC 117"
echo "2. Navigate to the biometria project"
echo "3. Click 'Redeploy' for both frontend and backend services"
echo "4. Wait for health checks to pass"
echo "5. Test at https://asistencia.sistemaslab.dev"

echo -e "${GREEN}🎉 Redeployment preparation complete!${NC}"