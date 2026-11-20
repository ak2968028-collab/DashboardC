#!/bin/sh
# docker-compose service "ollama": the AI assistant's model server.
# Ollama (qwen2.5:7b + nomic-embed-text) runs on the HP GPU PC as a Windows startup task. That PC keeps a reverse
# SSH tunnel to this host (its SSH on localhost:$SSH_PORT); this service forwards $LISTEN to Ollama over it, so the
# backend reaches the model at host.docker.internal:11435. Reconnects forever and pulls missing models.
set -u
apk add --no-cache openssh-client >/dev/null 2>&1 || echo "ollama: could not install openssh-client"
mkdir -p /root/.ssh
KEY=/root/.ssh/id_ed25519
if [ -s /run/secrets/ollama_key ]; then
  cp /run/secrets/ollama_key "$KEY" && chmod 600 "$KEY"
else
  echo "ollama: no SSH key at /run/secrets/ollama_key (set OLLAMA_SSH_KEY in .env)"
fi

pull_models() {
  for m in $MODELS; do
    if ! wget -q -T 10 -O - "http://$LISTEN/api/tags" | grep -q "\"name\":\"$m"; then
      echo "$(date '+%F %T') pulling $m on the GPU PC (first time only)..."
      wget -q -T 3600 -O /dev/null --header "Content-Type: application/json" \
        --post-data "{\"model\":\"$m\",\"stream\":false}" "http://$LISTEN/api/pull" \
        && echo "$(date '+%F %T') $m ready" || echo "$(date '+%F %T') pulling $m failed"
    fi
  done
}

while true; do
  echo "$(date '+%F %T') tunnel $LISTEN -> Ollama on $SSH_TARGET (ssh port $SSH_PORT)"
  (sleep 15 && pull_models) &
  ssh -N -p "$SSH_PORT" -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new \
    -L "$LISTEN:127.0.0.1:11434" "$SSH_TARGET" 2>&1 | grep -v -i "post-quantum\|store now\|upgraded\|pq.html"
  echo "$(date '+%F %T') tunnel closed; retrying in 20 s (GPU PC off, its reverse tunnel down, or SSH key not installed?)"
  sleep 20
done
