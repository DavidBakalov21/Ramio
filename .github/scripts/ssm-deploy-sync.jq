[
  "set -eux",
  "export DEBIAN_FRONTEND=noninteractive",
  ("sudo -u ubuntu test -d \"" + $app + "/.git\" || sudo -u ubuntu git clone --depth 1 --branch " + $branch + " \"" + $repo + "\" \"" + $app + "\""),
  ("sudo -u ubuntu bash -lc \"cd \\\"" + $app + "\\\" && git fetch origin " + $branch + " && git reset --hard origin/" + $branch + "\"")
]
