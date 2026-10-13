#!/bin/sh
# Streams every compose service's stdout/stderr into /logs/<service>.log, plus a
# combined /logs/all.log. Run by the log_collector service in docker-compose.yml.
#
# - Re-attaches automatically when a container restarts or is recreated.
# - Remembers the last line written (/logs/.state) so restarts don't duplicate.
# - Rotates each file at LOG_MAX_BYTES, keeping LOG_KEEP old copies (.1 … .N).

LOG_DIR=/logs
STATE_DIR=$LOG_DIR/.state
SERVICES=${LOG_SERVICES:-"fast_backend database geoserver cloudflared"}
MAX_BYTES=${LOG_MAX_BYTES:-10485760}
KEEP=${LOG_KEEP:-5}
OWNER=${LOG_OWNER:-1000:1000}

mkdir -p "$STATE_DIR"
chown "$OWNER" "$LOG_DIR" "$STATE_DIR" 2>/dev/null

# Our own compose project, so we only follow this stack's containers.
PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$(hostname)")
echo "log_collector: project=$PROJECT services=$SERVICES"

rotate() {
    f=$1
    [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" -lt "$MAX_BYTES" ] && return
    i=$KEEP
    rm -f "$f.$KEEP"
    while [ "$i" -gt 1 ]; do
        prev=$((i - 1))
        [ -f "$f.$prev" ] && mv "$f.$prev" "$f.$i"
        i=$prev
    done
    mv "$f" "$f.1"
    touch "$f" && chown "$OWNER" "$f" 2>/dev/null
}

follow() {
    svc=$1
    file=$LOG_DIR/$svc.log
    state=$STATE_DIR/$svc.ts
    touch "$file" && chown "$OWNER" "$file" 2>/dev/null

    while true; do
        cid=$(docker ps -q \
            --filter "label=com.docker.compose.project=$PROJECT" \
            --filter "label=com.docker.compose.service=$svc" | head -n1)
        if [ -z "$cid" ]; then
            sleep 5
            continue
        fi

        last=$(cat "$state" 2>/dev/null)
        since=${last:+--since $last}
        # shellcheck disable=SC2086
        docker logs --follow --timestamps $since "$cid" 2>&1 | {
            n=0
            while IFS= read -r line; do
                ts=${line%% *}
                # --since is inclusive: skip the line we already wrote.
                [ "$ts" = "$last" ] && continue
                printf '%s\n' "$line" >> "$file"
                printf '[%s] %s\n' "$svc" "$line" >> "$LOG_DIR/all.log"
                last=$ts
                n=$((n + 1))
                if [ $((n % 200)) -eq 0 ]; then
                    echo "$last" > "$state"
                    rotate "$file"
                    rotate "$LOG_DIR/all.log"
                fi
            done
            [ -n "$last" ] && echo "$last" > "$state"
        }
        sleep 2
    done
}

touch "$LOG_DIR/all.log" && chown "$OWNER" "$LOG_DIR/all.log" 2>/dev/null
for svc in $SERVICES; do
    follow "$svc" &
done
trap 'kill 0' TERM INT
wait
