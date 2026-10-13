#!/bin/sh
# Keeps frontend/tunnel.json in sync with the Cloudflare quick-tunnel URL.
# Run by the tunnel_url service in docker-compose.yml (starts with `docker compose up`).
#
# Every INTERVAL seconds it reads the cloudflared container's logs; when the
# trycloudflare URL changes it rewrites frontend/tunnel.json. If GITHUB_TOKEN is
# set it also commits just that file and pushes, so Vercel redeploys.

REPO=/repo
FILE=frontend/tunnel.json
INTERVAL=${INTERVAL:-10}
OWNER=${LOG_OWNER:-1000:1000}

cd "$REPO" || exit 1
git config --global --add safe.directory "$REPO"
git config --global user.name "${GIT_AUTHOR_NAME:-tunnel-url-bot}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-tunnel-url-bot@users.noreply.github.com}"

# Our own compose project, so we only read this stack's cloudflared.
PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$(hostname)")
echo "tunnel_url: project=$PROJECT push=$([ -n "$GITHUB_TOKEN" ] && echo on || echo off)"

push() {
    git add "$FILE"
    git commit -q -m "Update tunnel URL to $1" -- "$FILE" || return 0
    # Files git created as root inside .git must stay usable from the host.
    chown -R "$OWNER" .git
    remote=$(git remote get-url origin | sed -E 's#^(https://|git@)github.com[:/]##; s#\.git$##')
    branch=$(git rev-parse --abbrev-ref HEAD)
    if git push -q "https://x-access-token:$GITHUB_TOKEN@github.com/$remote.git" "HEAD:$branch"; then
        git fetch -q origin "$branch" 2>/dev/null
        chown -R "$OWNER" .git
        echo "tunnel_url: pushed to $branch; Vercel will redeploy"
    else
        echo "tunnel_url: push failed (branch behind origin?); run 'git pull --rebase && git push' on the host"
    fi
}

while true; do
    cid=$(docker ps -q \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=cloudflared" | head -n1)
    url=${cid:+$(docker logs "$cid" 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)}

    if [ -n "$url" ] && ! grep -q "\"$url\"" "$FILE" 2>/dev/null; then
        echo "tunnel_url: new URL $url"
        printf '{\n  "API_URL": "%s",\n  "GEOSERVER_URL": "%s"\n}\n' "$url" "$url" > "$FILE"
        chown "$OWNER" "$FILE"
        [ -n "$GITHUB_TOKEN" ] && push "$url"
    fi
    sleep "$INTERVAL"
done
