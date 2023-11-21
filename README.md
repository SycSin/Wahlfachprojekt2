# Wahlfachprojekt 2

This project aims to provide a platform for the "MyRecipes" project which was developed during the 2nd and 3rd term within the "Web Technologies" and "Software Engineering" lectures.

## Key Specifications

* 4x Raspberry Pi 4B 4GB units strategically allocated (3x control plane, 1x dedicated to Jenkins and NFS server)
* MicroK8s Cluster with High Availability configuration
* Infrastructure as Code (Ansible, Helm, Groovy)
* Automated deployment of the web application (MyRecipes) facilitated by ArgoCD using GitOps principles
* Cluster monitoring implemented through Prometheus with visualizations available on Grafana

## SRS Requirements

### Must:
* The system must adapt the MyRecipes Application for seamless integration within the Kubernetes Cluster.
* The system must generate Helm Charts for the MyRecipes Software to ensure efficient deployment and management within the Kubernetes environment.
* The system must utilize Infrastructure as Code (IaC) through Ansible for node provisioning and the cluster setup, ensuring reproducibility and scalability.
* The system must establish an automated build pipeline triggered by code changes, ensuring continuous integration and streamlined development workflows.
* The system must include a MariaDB database running in the Kubernetes cluster to store and provide data to the MyRecipes application.

### Should:
* The system should incorporate automated deployment processes for the MyRecipes Software, improving efficiency and reducing manual intervention.
* The system should provide a MicroK8S cluster setup through Jenkins Jobs, streamlining the process and ensuring a controlled deployment pipeline.
* The system should utilize ArgoCD for GitOps-based configuration management to enhance version control and simplify cluster configuration.

### Could:
* The system could automatically respond to changed images within the cluster and initiate a new deployment, ensuring efficient updates and maintenance.
* The system could implement high availability measures not only for the cluster but also the MyRecipes Application, enhancing system resilience.
* The system could integrate Prometheus for cluster monitoring with a Grafana dashboard, providing insights into performance and potential issues.

### Won't:
* The system won't feature Prometheus alerts as part of its monitoring setup.
* The system won't include any Secret Management tools managing Kubernetes Secret objects.
* The system won't provide a cluster backup functionality.
* The system won't involve multi-platform redundancy; it will focus on local redundancy measures.

## Kubernetes Cluster for MyRecipes

### Prerequisites 
* Prepare the SD cards with Ubuntu Server 22.04 (64-Bit) for the nodes

### Setting up the nfs01 server
```bash
sudo su -
apt-get update

mkdir -p /mnt/ssd/nfs/microk8s

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

echo "127.0.0.1 localhost nfs01
::1 ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
ff02::3 ip6-allhosts

192.168.1.210 nfs01
192.168.1.211 node01
192.168.1.212 node02
192.168.1.213 node03
192.168.1.214 registry.myrecipes.at" > /etc/hosts
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

echo "{
  "insecure-registries" : ["registry.myrecipes.at"]
}" > /etc/docker/daemon.json
systemctl restart docker

echo "FROM jenkins/jenkins:lts
USER root
#Installing ansible & docker packages
RUN apt-get update \
    && apt-get install -y ansible docker.io
# Retrieving kubectl & helm binaries
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl" \
    && chmod +x ./kubectl \
    && mv ./kubectl /usr/local/bin/kubectl \
    && curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 \
    && chmod +x get_helm.sh && ./get_helm.sh
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
     - 127.0.0.1:50000:50000
    container_name: jenkins
    volumes:
      - ./jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
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
