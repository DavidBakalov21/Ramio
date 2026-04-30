[
  "set -eux",
  "export DEBIAN_FRONTEND=noninteractive",
  ("test -f \"" + $app + "/.github/scripts/ec2-deploy.sh\" || { echo \"Missing .github/scripts/ec2-deploy.sh - push to origin/master\"; exit 1; }"),
  ("sudo chmod +x \"" + $app + "/.github/scripts/ec2-deploy.sh\""),
  ("sudo rm -f \"" + $app + "/.deploy-status\""),
  ("sudo touch /tmp/ramio-deploy.log && sudo chmod 666 /tmp/ramio-deploy.log"),
  ("sudo systemd-run --unit ramio-deploy --collect --property=WorkingDirectory=\"" + $app + "\" --setenv=RAMIO_APP_DIR=\"" + $app + "\" /bin/bash -lc \"" + $app + "/.github/scripts/ec2-deploy.sh >> /tmp/ramio-deploy.log 2>&1\""),
  "echo launched via systemd-run"
]
