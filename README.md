# Wahlfachprojekt 2

..insert description here..

## PXE Booting

### Enable network-boot on the k8s nodes
* Prepare an SD card/USB-Stick with Raspberry OS
* Flash the EEPROM on the pi with the new boot order

### Flashing the EEPROM (on node01, node02, node03)
```bash
sudo su -
cp /lib/firmware/raspberrypi/bootloader/stable/pieeprom-2022-03-10.bin pieeprom.bin

echo "[all]
BOOT_UART=0
WAKE_ON_GPIO=1
POWER_OFF_ON_HALT=0
DHCP_TIMEOUT=45000
DHCP_REQ_TIMEOUT=4000
TFTP_FILE_TIMEOUT=30000
TFTP_IP=192.168.1.210
TFTP_PREFIX=0
ENABLE_SELF_UPDATE=1
DISABLE_HDMI=0
BOOT_ORDER=0x241
SD_CARD_MAX_RETRIES=3
NET_BOOT_MAX_RETRIES=5" > bootconf.txt

rpi-eeprom-config --out pieeprom-new.bin --config bootconf.txt pieeprom.bin
rpi-eeprom-update -d -f ./pieeprom-new.bin
reboot
vcgencmd bootloader_config
```

### Setting up the nfs01 server
```bash
sudo su -
apt-get update

mkdir -p /mnt/ssd/nfs/node{01,02,03}
mkdir -p /mnt/ssd/tftpboot/192.168.1.{211,212,213}
apt-get install dnsmasq tcpdump nfs-kernel-server

# format the disk /dev/sda to have the following partition table:
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
/dev/sda2       499114560 500118191   1003632 490.1M 83 Linux

echo "proc            /proc           proc    defaults          0       0
PARTUUID=3631454f-01  /boot           vfat    defaults          0       2
PARTUUID=3631454f-02  /               ext4    defaults,noatime  0       1
PARTUUID=9b9b618a-01 /mnt/ssd/nfs ext4 defaults,nofail 0 2
PARTUUID=9b9b618a-02 /mnt/ssd/tftpboot vfat defaults,nofail,uid=0,gid=0,umask=000 0 0
" > /etc/fstab

mount -a
chmod -R 777 /mnt/ssd/tftpboot
cp -r /boot/* /mnt/ssd/tftpboot/192.168.1.211/
cp -r /boot/* /mnt/ssd/tftpboot/192.168.1.212/
cp -r /boot/* /mnt/ssd/tftpboot/192.168.1.213/

echo "[Match]
Name=eth0
[Network]
DHCP=no" > /etc/systemd/network/10-eth0.netdev

echo "[Match]
Name=eth0
[Network]
Address=192.168.1.210/24
DNS=192.168.1.1 8.8.8.8 8.8.4.4
Gateway=192.168.1.1" > /etc/systemd/network/11-eth0.network

echo "nameserver 8.8.8.8
nameserver 8.8.4.4" > /etc/resolv.dnsmasq.conf


echo "port=0
dhcp-range=192.168.1.255,proxy
log-dhcp
enable-tftp
tftp-root=/mnt/ssd/tftpboot
pxe-service=0,Raspberry Pi Boot
tftp-unique-root
resolv-file=/etc/resolv.dnsmasq.conf" > /etc/dnsmasq.conf

systemctl enable dnsmasq.service
systemctl restart dnsmasq.service

echo "/mnt/ssd/nfs/node01 *(rw,sync,no_subtree_check,no_root_squash)
/mnt/ssd/nfs/node02 *(rw,sync,no_subtree_check,no_root_squash)
/mnt/ssd/nfs/node03 *(rw,sync,no_subtree_check,no_root_squash)
/mnt/ssd/tftpboot/192.168.1.211 192.168.1.211(rw,sync,no_subtree_check,no_root_squash)
/mnt/ssd/tftpboot/192.168.1.212 192.168.1.212(rw,sync,no_subtree_check,no_root_squash)
/mnt/ssd/tftpboot/192.168.1.213 192.168.1.213(rw,sync,no_subtree_check,no_root_squash)
/home/denis 192.168.1.0/24(rw,sync,no_subtree_check)" > /etc/exports

systemctl enable rpcbind
systemctl restart rpcbind
systemctl enable nfs-kernel-server
systemctl restart nfs-kernel-server

echo "console=serial0,115200 console=tty root=/dev/nfs nfsroot=192.168.1.210:/mnt/ssd/nfs/node01,vers=4 rw ip=dhcp fsck.repair=yes rootwait cgroup_memory=1 cgroup_enable=memory" > /mnt/ssd/tftpboot/192.168.1.211/cmdline.txt
echo "console=serial0,115200 console=tty root=/dev/nfs nfsroot=192.168.1.210:/mnt/ssd/nfs/node02,vers=4 rw ip=dhcp fsck.repair=yes rootwait cgroup_memory=1 cgroup_enable=memory" > /mnt/ssd/tftpboot/192.168.1.212/cmdline.txt
echo "console=serial0,115200 console=tty root=/dev/nfs nfsroot=192.168.1.210:/mnt/ssd/nfs/node03,vers=4 rw ip=dhcp fsck.repair=yes rootwait cgroup_memory=1 cgroup_enable=memory" > /mnt/ssd/tftpboot/192.168.1.213/cmdline.txt

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

rsync -xa --exclude /mnt/ssd / /mnt/ssd/nfs/node-base-template

# node01 (on the nfs01 server)
rsync -xa --exclude /mnt/ssd/nfs/node-base-template / /mnt/ssd/nfs/node01/
cd /mnt/ssd/nfs/node01
mount --bind /dev dev
mount --bind /sys sys
mount --bind /proc proc
chroot .
rm /etc/ssh/ssh_host_*
dpkg-reconfigure openssh-server
echo "proc            /proc           proc    defaults          0       0
192.168.1.210:/mnt/ssd/tftpboot/192.168.1.211 /boot nfs defaults,vers=3,proto=tcp 0 0" > /etc/fstab
echo "node01" > /etc/hostname
sed -i 's/nfs01/node01/g' /etc/hosts
rm /etc/systemd/network/*
systemctl disable nfs-server.service
systemctl disable dnsmasq.service
exit
umount dev
umount sys
umount proc

# node02 (on the nfs01 server)
rsync -xa --exclude /mnt/ssd/nfs/node-base-template / /mnt/ssd/nfs/node02/
cd /mnt/ssd/nfs/node01
mount --bind /dev dev
mount --bind /sys sys
mount --bind /proc proc
chroot .
rm /etc/ssh/ssh_host_*
dpkg-reconfigure openssh-server
echo "proc            /proc           proc    defaults          0       0
192.168.1.210:/mnt/ssd/tftpboot/192.168.1.212 /boot nfs defaults,vers=3,proto=tcp 0 0" > /etc/fstab
echo "node02" > /etc/hostname
sed -i 's/nfs01/node02/g' /etc/hosts
rm /etc/systemd/network/*
systemctl disable nfs-server.service
systemctl disable dnsmasq.service
exit
umount dev
umount sys
umount proc


# node03 (on the nfs01 server)
rsync -xa --exclude /mnt/ssd/nfs/node-base-template / /mnt/ssd/nfs/node03/
cd /mnt/ssd/nfs/node03
mount --bind /dev dev
mount --bind /sys sys
mount --bind /proc proc
chroot .
rm /etc/ssh/ssh_host_*
dpkg-reconfigure openssh-server
echo "proc            /proc           proc    defaults          0       0
192.168.1.210:/mnt/ssd/tftpboot/192.168.1.213 /boot nfs defaults,vers=3,proto=tcp 0 0" > /etc/fstab
echo "node03" > /etc/hostname
sed -i 's/nfs01/node03/g' /etc/hosts
rm /etc/systemd/network/*
systemctl disable nfs-server.service
systemctl disable dnsmasq.service
exit
umount dev
umount sys
umount proc
```

### Setup Jenkins on nfs01
```bash
sudo su -
apt install -y docker.io docker-compose
usermod -a -G docker denis
mkdir /opt/jenkins_docker
cd /opt/jenkins_docker

echo "FROM jenkins/jenkins:lts
USER root
RUN apt-get update && apt-get install -y ansible
USER jenkins
" > Dockerfile

echo "version: '3'
services:
  jenkins:
    build:
      context: .
      dockerfile: Dockerfile
    image: jenkins-with-ansible
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
" > docker-compose.yml

docker-compose up -d

# Go to http://192.168.1.210:8080 on the browser and paste the intialAdminPassword (the password can be retrieved using the following command), afterwards finish the setup
docker exec -t jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Generate a public/private keypair and paste the private key to the credentials tab, and paste the public key to the SSH-Keys for the GitHub account to access this repository
ssh-keygen -b 4096

# Generate a public/private keypair for the jenkins agent to connect to nfs01 (by adding the public key to the authorized_keys)
# Download and install the SSH Agent Plugin on the jenkins to enable connecting to nodes via SSH using the defined credentials
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
