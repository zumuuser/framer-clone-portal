import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('178.105.193.3', username='root', password='TBA2025TBA', timeout=30)

cmd = """
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f /root/.ssh/id_rsa ]; then
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" -C "framerclone@webyverse.com"
fi
cat /root/.ssh/id_rsa.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
cat /root/.ssh/id_rsa
"""

stdin, stdout, stderr = client.exec_command(cmd)
key = stdout.read().decode()
err = stderr.read().decode()
print('KEY_START')
print(key)
print('KEY_END')
if err:
    print('ERR:', err)
client.close()
