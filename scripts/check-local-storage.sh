#!/usr/bin/env bash
# Run from a development checkout. Pass Compose global flags, e.g. --env-file .env.example -p hired-storage-check.
# Recreates only SeaweedFS, retaining its named volume. Uses a unique synthetic object and deletes it afterward.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose "$@")
objectKey="hired-storage-smoke-$(date +%s)-$$.txt"

storageRequest() {
  "${compose[@]}" exec -T seaweedfs sh -eu -c '
    operation="$1"; key="$2"
    url="http://127.0.0.1:8333/$S3_BUCKET/$key"
    case "$operation" in
      put) curl --fail --silent --show-error --max-time 10 --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" --request PUT --data-binary "synthetic hired storage check" "$url" ;;
      get) curl --fail --silent --show-error --max-time 10 --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" "$url" ;;
      delete) curl --fail --silent --show-error --max-time 10 --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" --request DELETE "$url" ;;
      anonymous-get) curl --silent --show-error --max-time 10 --output /dev/null --write-out "%{http_code}" "$url" ;;
      anonymous-put) curl --silent --show-error --max-time 10 --output /dev/null --write-out "%{http_code}" --request PUT --data-binary "unauthorized" "$url" ;;
      invalid-signature) curl --silent --show-error --max-time 10 --output /dev/null --write-out "%{http_code}" --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:incorrect-synthetic-secret" "$url" ;;
    esac
  ' sh "$1" "$objectKey"
}

"${compose[@]}" --profile storage up -d --wait --wait-timeout 90 seaweedfs
hostAddress="$("${compose[@]}" port seaweedfs 8333)"
bucketName="$("${compose[@]}" exec -T seaweedfs printenv S3_BUCKET)"
[[ "$hostAddress" == 127.0.0.1:* ]]
curl --fail --silent --show-error --max-time 5 "http://$hostAddress/readyz" >/dev/null
trap 'storageRequest delete >/dev/null 2>&1 || true' EXIT
storageRequest put
[[ "$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "http://$hostAddress/$bucketName/$objectKey")" == '403' ]]
[[ "$(storageRequest get)" == 'synthetic hired storage check' ]]
[[ "$(storageRequest anonymous-get)" == '403' ]]
[[ "$(storageRequest anonymous-put)" == '403' ]]
[[ "$(storageRequest invalid-signature)" == '403' ]]
# An unauthorized PUT must not overwrite an existing object.
[[ "$(storageRequest get)" == 'synthetic hired storage check' ]]
"${compose[@]}" --profile storage up -d --force-recreate --wait --wait-timeout 90 seaweedfs
curl --fail --silent --show-error --max-time 5 "http://$hostAddress/readyz" >/dev/null
[[ "$(storageRequest get)" == 'synthetic hired storage check' ]]
[[ "$(storageRequest anonymous-get)" == '403' ]]
printf '%s\n' 'Signed upload/download, anonymous denial, invalid signature, unchanged content and volume persistence passed.'
