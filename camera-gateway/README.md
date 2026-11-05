# Bizora Camera Gateway — foundation v0.1.0

A local service for a shop PC or mini-PC on the same LAN as a Dahua/Hikvision NVR or IP camera.

## Current scope

- Sends authenticated gateway heartbeats to the Supabase Edge Function.
- Probes configured RTSP streams locally using OpenCV/FFmpeg.
- Reports camera online/offline status to Bizora.
- Keeps RTSP URLs and camera access details on the local machine; they are never sent to Supabase.
- Uses a one-time enrolled gateway token. The database stores only its SHA-256 hash.

**Not implemented yet:** ONVIF discovery, QR pairing UX, continuous video analytics, people counting, table occupancy, meal/drink detection, or AI event generation. This is a connectivity foundation, not an AI detector.

## Requirements

- Windows/Linux mini-PC or shop computer on the same network as the NVR/cameras.
- Python 3.10+.
- RTSP enabled on the camera/NVR and a dedicated read-only camera account.
- A camera row already created in Bizora for each stream.

## Install

```bash
cd camera-gateway
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux: source .venv/bin/activate
pip install -r requirements.txt
cp cameras.example.json cameras.json
```

Edit `cameras.json` locally. Replace the sample UUID with the camera UUID from Bizora and enter the local RTSP address. Do not commit this file; it is excluded by .gitignore. Restrict access to it because it contains camera connection details.

Set environment variables:

- `BIZORA_GATEWAY_URL=https://pywdltkplgvbxdejqext.supabase.co/functions/v1`
- `BIZORA_GATEWAY_TOKEN=<token issued by Bizora enrollment>`
- `BIZORA_CAMERAS_CONFIG=./cameras.json` (optional)
- `BIZORA_PROBE_INTERVAL_SECONDS=60` (optional)

Run:

```bash
python agent.py
```

## Security

- Never use a Supabase service-role key on this device.
- Use a dedicated read-only camera account, not the NVR administrator account.
- Keep the local camera config and gateway token out of Git and support screenshots.
- Use a private LAN/VPN; do not expose RTSP ports directly to the public internet.
- Revoke a lost gateway token by setting its agent status to disabled through an administrator-controlled backend operation.

## Enrollment/API

The Edge Function is `camera-gateway`.

An authenticated owner/manager can POST an enroll action with their Supabase user session and organization ID. The response contains a gateway token exactly once. Store it securely.

The local agent uses its token for heartbeat and camera-probe requests. The Edge Function hashes the token and checks it against the gateway-agent table before accepting requests.
