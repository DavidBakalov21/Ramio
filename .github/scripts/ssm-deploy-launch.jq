[
  "set -eux",
  "export DEBIAN_FRONTEND=noninteractive",
  ("test -f \"" + $app + "/.github/scripts/ec2-deploy.sh\" || { echo \"Missing .github/scripts/ec2-deploy.sh - push to origin/master\"; exit 1; }"),
  ("sudo chmod +x \"" + $app + "/.github/scripts/ec2-deploy.sh\""),
  ("sudo rm -f \"" + $app + "/.deploy-status\""),
  ("sudo -u ubuntu bash -lc '" + "cd \"" + $app + "\" && nohup env RAMIO_APP_DIR=\"" + $app + "\" bash .github/scripts/ec2-deploy.sh >> /tmp/ramio-deploy.log 2>&1 </dev/null &" + "'"),
  "echo launched"
]
