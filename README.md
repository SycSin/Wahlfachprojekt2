# Wahlfachprojekt 2

..insert description here..

## PXE Booting

### Enable network-boot on the k8s nodes
* Prepare the SD cards with Ubuntu Server 22.04 (64-Bit)

### Setting up the nfs01 server
```bash
sudo su -
apt-get update

# Format the disk /dev/sda to have the following partition table:
$> fdisk /dev/sda
Command (m for help): p
Disk /dev/sda: 238.47 GiB, 256060514304 bytes, 500118192 sectors
Disk model:
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 33553920 bytes
Disklabel type: dos
Disk identifier: 0x9b9b618a
Device     Boot     Start       End   Sectors   Size Id Type
/dev/sda1           65535 499114559 499049025   238G 83 Linux

echo "proc            /proc           proc    defaults          0       0
PARTUUID=3631454f-01  /boot           vfat    defaults          0       2
PARTUUID=3631454f-02  /               ext4    defaults,noatime  0       1
PARTUUID=9b9b618a-01 /mnt/ssd/nfs ext4 defaults,nofail 0 2
" > /etc/fstab

mount -a

mkdir -p /mnt/ssd/nfs/microk8s
chown nobody:nogroup /mnt/ssd/nfs/microk8s
chmod 0777 /mnt/ssd/nfs/microk8s
apt-get install dnsmasq tcpdump nfs-kernel-server

systemctl enable dnsmasq.service
systemctl restart dnsmasq.service

echo "/mnt/ssd/nfs/microk8s 192.168.1.0/24(rw,sync,no_subtree_check)" > /etc/exports

systemctl enable rpcbind
systemctl restart rpcbind
systemctl enable nfs-kernel-server
systemctl restart nfs-kernel-server
systemctl enable rpc-statd
systemctl restart rpc-statd

# The delayed nfs-server start workaround is required since the mount-points are not present when starting the nfs-server after rebooting which causes a failed start of the nfs-server
echo "[Unit]
Description=Delayed NFS Server Start
Wants=network-online.target
After=network-online.target local-fs.target
ConditionPathExists=/mnt/ssd/nfs/node01

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl start nfs-server.service

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/nfs-delayed.service

systemctl-daemon reload
systemctl enable nfs-delayed.service
````

### node01, node02, node03
```bash
sudo su -
# Enabling passwordless logins via SSH
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCtMauPksCZW4cItiTteYsRyArzbRWrM5p2d2vCQS8TAS+bH2dlFvkdnUWU+Fu6ux4d/ZooO2YNeCHRefe1Ke7MzWqjER0ZrWaCDO8cayPVoNnQcHtw/8r2x962e34b+j+67ni1ROD9qZz/q5MmYYW5UHp2VLqsGVWqQb6lOLgDDD7wQ/cbYp+7EveFQEKGczU8wSv4GhhyyGmWqEmt5+aM1cH0FiVhWIGLUY4bnC9zMwzQuuzu5r1yQqRFnD0XZZOqTu0+tZ+5Lxa3p0wdTfA58Yw+UeJsHuarDBD0miI5Xw2z7CCv5ssWGt11ZmsI2evshTRsJ9Ww8BUPclH6XCnQrHbq01l9EGJumfCYcjYHPrGwNGz4tWE99oG6VDGBiZb7mfu7/HU6UND9mCLwupCkQz99eisPAKINDTxU4GVGN+M+8VbHFP3hqmWLADKLY+toVQm+rObfiLufRDCzsE6VGHJhpjAi6zp3wmQnEmsOER9wxE2ahMfN34eN0O9b7P6MXiybmHjiN0ZduQpidL0ds0p9PfEWsFbNoJ6ozqBLqkaKECTVQWfuCjjx7bWeop0ica9+z8i/Z2jbLdglAzlUgfvTzqbQiPeqGQ5bEzgBcZ00LjT47IteCk1Bm51aaKOyNiaHZHEglSsklA8ucmiDwAkDoFexZXbAhk/KtZap7Q== root@nfs01" > ~/.ssh/authorized_keys
# Appending cgroups to cmdline.txt
echo "$(cat /boot/firmware/cmdline.txt) cgroup_enable=cpuset cgroup_memory=1 cgroup_enable=memory" > /boot/firmware/cmdline.txt
reboot
```

### Setup Jenkins on nfs01
```bash
sudo su -
apt install -y docker.io docker-compose
usermod -a -G docker denis
mkdir -p /mnt/ssd/nfs/docker/jenkins_docker
cd /mnt/ssd/nfs/docker/jenkins_docker

echo "FROM jenkins/jenkins:lts
USER root
RUN apt-get update && apt-get install -y ansible docker.io
USER jenkins
" > Dockerfile

echo "version: '3'
services:
  jenkins:
    build:
      context: .
      dockerfile: Dockerfile
    image: jenkins
    restart: unless-stopped
    privileged: true
    user: root
    ports:
     - 127.0.0.1:8080:8080
     - 50000:50000
    container_name: jenkins
    volumes:
      - ./jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
      
  registry:
    image: registry:latest
    container_name: docker-registry
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry

volumes:
  registry-data:
" > docker-compose.yml

docker-compose up --build -d

# Go to http://192.168.1.210:8080 on the browser and paste the intialAdminPassword (the password can be retrieved using the following command), afterwards finish the setup
docker exec -t jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Generate a public/private keypair and paste the private key to the credentials tab, and paste the public key to the SSH-Keys for the GitHub account to access this repository
ssh-keygen -b 4096

# Generate a public/private keypair for the jenkins agent to connect to nfs01 (by adding the public key to the authorized_keys)
# Download and install the SSH Agent Plugin on the jenkins to enable connecting to nodes via SSH using the defined credentials
# Download and install the Docker, Docker Pipelines & Docker Build Plugins on the jenkins to enable docker operations within pipelines 
```

### Setup Nginx on nfs01
```bash
sudo su -
apt update
apt install -y nginx
mkdir -p /etc/nginx/ssl
# Generate a self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/jenkins.key -out /etc/nginx/ssl/jenkins.crt
# Create a vHost for Jenkins
echo "server {
    listen 80;
    server_name jenkins;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name jenkins;

    ssl_certificate /etc/nginx/ssl/jenkins.crt;
    ssl_certificate_key /etc/nginx/ssl/jenkins.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}" > /etc/nginx/sites-available/jenkins.conf
ln -s /etc/nginx/sites-available/jenkins.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### Installing Ansible (and dependencies)
```bash
sudo su -
apt update
apt install -y ansible
cd ansible
# verify the installation with the following command: 
ansible-playbook -i inventories/nodes.yml provision.yml --diff --check
```
