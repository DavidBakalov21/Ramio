[
  "export DEBIAN_FRONTEND=noninteractive",
  ("sudo -u ubuntu test -d \"" + $app + "/.git\" || sudo -u ubuntu git clone --depth 1 --branch " + $branch + " \"" + $repo + "\" \"" + $app + "\""),
  ("sudo -u ubuntu bash -lc \"cd \\\"" + $app + "\\\" && git fetch origin " + $branch + " && git reset --hard origin/" + $branch + "\""),
  ("sudo chmod +x \"" + $app + "/.github/scripts/ec2-deploy.sh\""),
  ("sudo rm -f \"" + $app + "/.deploy-status\""),
  ("sudo -u ubuntu bash -lc \"cd \\\"" + $app + "\\\" && nohup env RAMIO_APP_DIR=\\\"" + $app + "\\\" bash .github/scripts/ec2-deploy.sh >> /tmp/ramio-deploy.log 2>&1 </dev/null &\""),
  "sleep 5",
  "echo Background deploy started; tail -5 /tmp/ramio-deploy.log 2>/dev/null || true"
]
