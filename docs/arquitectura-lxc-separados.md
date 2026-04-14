# Arquitectura con LXCs Separados

## Distribución Propuesta

### LXC 118 - Sistema de Votaciones (4GB RAM, 20GB Disco)
- Node.js/Python Backend
- PostgreSQL 15
- Redis 7
- Nginx como proxy reverso
- **Dominio:** votaciones.sistemaslab.com

### LXC 119 - Sistema de Tesis (4GB RAM, 30GB Disco)
- Backend Application
- MySQL 8.0 (requiere más recursos)
- Nginx como proxy reverso
- **Dominio:** tesis.sistemaslab.com

### LXC 120 - Sistema Biométrico (4GB RAM, 25GB Disco)
- Frontend React
- Backend API
- PostgreSQL 16 con pgvector
- Nginx como proxy reverso
- **Dominio:** biometria.sistemaslab.com

### LXC 121 - Sistema Parqueos/Alquiler (6GB RAM, 25GB Disco)
- API Gateway
- 2 Backend Services
- 2 Frontend Applications
- 2 PostgreSQL instances
- Redis
- Nginx como proxy reverso
- **Dominios:** 
  - parqueos.sistemaslab.com
  - alquiler.sistemaslab.com

### LXC 117 - Traefik Central + Monitoring (2GB RAM, 10GB Disco)
- Traefik como reverse proxy central
- Netdata para monitoring
- Portainer para gestión Docker (opcional)
- **Dominio:** admin.sistemaslab.com

## Configuración de cada LXC

### Script de configuración base para cada LXC:

```bash
#!/bin/bash
# setup-lxc-base.sh

# Variables
LXC_ID=$1
LXC_NAME=$2
MEMORY=$3
DISK=$4
IP=$5

# Crear LXC
pct create $LXC_ID /var/lib/vz/template/cache/debian-12-standard_12.2-1_amd64.tar.gz \
  --hostname $LXC_NAME \
  --memory $MEMORY \
  --cores 2 \
  --net0 name=eth0,bridge=vmbr0,ip=$IP/24,gw=192.168.31.1 \
  --storage local-lvm \
  --rootfs local-lvm:$DISK \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1

# Iniciar LXC
pct start $LXC_ID

# Esperar inicio
sleep 10

# Actualizar sistema
pct exec $LXC_ID -- apt update && apt upgrade -y

# Instalar Docker
pct exec $LXC_ID -- apt install -y curl ca-certificates gnupg
pct exec $LXC_ID -- install -m 0755 -d /etc/apt/keyrings
pct exec $LXC_ID -- curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
pct exec $LXC_ID -- chmod a+r /etc/apt/keyrings/docker.gpg
pct exec $LXC_ID -- echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
pct exec $LXC_ID -- apt update
pct exec $LXC_ID -- apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Instalar herramientas básicas
pct exec $LXC_ID -- apt install -y nginx git htop ncdu nano wget

# Configurar Docker para auto-restart
pct exec $LXC_ID -- systemctl enable docker
pct exec $LXC_ID -- systemctl start docker

# Configurar swap
pct exec $LXC_ID -- fallocate -l 2G /swapfile
pct exec $LXC_ID -- chmod 600 /swapfile
pct exec $LXC_ID -- mkswap /swapfile
pct exec $LXC_ID -- swapon /swapfile
pct exec $LXC_ID -- echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "LXC $LXC_ID ($LXC_NAME) configurado exitosamente!"
```

## Ejemplo de uso:
```bash
# Sistema de Votaciones
./setup-lxc-base.sh 118 votaciones 4096 20 192.168.31.118

# Sistema de Tesis
./setup-lxc-base.sh 119 tesis 4096 30 192.168.31.119

# Sistema Biométrico
./setup-lxc-base.sh 120 biometria 4096 25 192.168.31.120

# Sistema Parqueos/Alquiler
./setup-lxc-base.sh 121 parqueos-alquiler 6144 25 192.168.31.121
```

## Configuración de Traefik Central (LXC 117)

```yaml
# traefik.yml
global:
  checkNewVersion: true
  sendAnonymousUsage: false

api:
  dashboard: true
  debug: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@sistemaslab.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
```

## Routing dinámico para cada servicio:

```yaml
# /etc/traefik/dynamic/routes.yml
http:
  routers:
    votaciones:
      rule: "Host(`votaciones.sistemaslab.com`)"
      service: votaciones
      tls:
        certResolver: letsencrypt
    
    tesis:
      rule: "Host(`tesis.sistemaslab.com`)"
      service: tesis
      tls:
        certResolver: letsencrypt
    
    biometria:
      rule: "Host(`biometria.sistemaslab.com`)"
      service: biometria
      tls:
        certResolver: letsencrypt
    
    parqueos:
      rule: "Host(`parqueos.sistemaslab.com`)"
      service: parqueos
      tls:
        certResolver: letsencrypt
    
    alquiler:
      rule: "Host(`alquiler.sistemaslab.com`)"
      service: alquiler
      tls:
        certResolver: letsencrypt

  services:
    votaciones:
      loadBalancer:
        servers:
          - url: "http://192.168.31.118:80"
    
    tesis:
      loadBalancer:
        servers:
          - url: "http://192.168.31.119:80"
    
    biometria:
      loadBalancer:
        servers:
          - url: "http://192.168.31.120:80"
    
    parqueos:
      loadBalancer:
        servers:
          - url: "http://192.168.31.121:80"
    
    alquiler:
      loadBalancer:
        servers:
          - url: "http://192.168.31.121:81"
```