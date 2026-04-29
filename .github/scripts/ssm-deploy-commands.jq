[
  "set -eux",
  "export DEBIAN_FRONTEND=noninteractive",
  ("sudo -u ubuntu test -d \"" + $app + "/.git\" || sudo -u ubuntu git clone --depth 1 --branch " + $branch + " \"" + $repo + "\" \"" + $app + "\""),
  ("sudo -u ubuntu bash -lc \"cd \\\"" + $app + "\\\" && git fetch origin " + $branch + " && git reset --hard origin/" + $branch + "\""),
  "apt-get update -y",
  "apt-get install -y nginx docker.io docker-compose-v2",
  "systemctl enable docker nginx || true",
  "systemctl start docker",
  "docker info",
  ("sudo -u ubuntu bash -lc '" + "cd \"" + $app + "\" && docker compose pull > /tmp/ramio-compose-pull.log 2>&1 || true; tail -40 /tmp/ramio-compose-pull.log || true" + "'"),
  ("sudo -u ubuntu bash -lc '" + "cd \"" + $app + "\" && docker compose up -d --build --remove-orphans > /tmp/ramio-compose-up.log 2>&1; ec=$?; tail -200 /tmp/ramio-compose-up.log; exit $ec" + "'"),
  ("install -m 644 \"" + $app + "/nginx/default.conf\" /etc/nginx/sites-available/default"),
  "ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default",
  "nginx -t",
  "systemctl reload nginx",
  ("sudo -u ubuntu bash -lc '" + "cd \"" + $app + "\" && docker compose ps" + "'")
]
