#!/usr/bin/env python3
"""Bizora local camera gateway: RTSP reachability probe + secure heartbeat.

This first release verifies local camera streams and reports status only.
It does not yet perform people/table/object detection.
"""
from __future__ import annotations
import json, logging, os, signal, sys, time
from pathlib import Path
from typing import Any
import requests

try:
    import cv2
except ImportError:
    cv2 = None

VERSION = "0.1.0"
FUNCTION_URL = os.environ.get("BIZORA_GATEWAY_URL", "").rstrip("/")
TOKEN = os.environ.get("BIZORA_GATEWAY_TOKEN", "")
CONFIG_PATH = Path(os.environ.get("BIZORA_CAMERAS_CONFIG", "./cameras.json"))
INTERVAL = max(30, int(os.environ.get("BIZORA_PROBE_INTERVAL_SECONDS", "60")))
TIMEOUT = max(3, int(os.environ.get("BIZORA_RTSP_TIMEOUT_SECONDS", "8")))
RUNNING = True

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bizora-camera-gateway")


def stop_handler(_sig: int, _frame: Any) -> None:
    global RUNNING
    RUNNING = False


signal.signal(signal.SIGINT, stop_handler)
signal.signal(signal.SIGTERM, stop_handler)


def load_config() -> dict:
    if not CONFIG_PATH.is_file():
        raise RuntimeError(f"Missing camera config file: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data.get("cameras"), list):
        raise ValueError("cameras.json must contain a 'cameras' array")
    return data


def api(action: str, payload: dict) -> dict:
    response = requests.post(
        f"{FUNCTION_URL}/camera-gateway",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json={"action": action, **payload},
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Gateway API {response.status_code}: {response.text[:300]}")
    return response.json()


def probe_rtsp(uri: str) -> bool:
    if cv2 is None:
        raise RuntimeError("OpenCV is missing. Install requirements.txt first.")
    # URI stays on this local machine; it is never sent to Supabase or logged.
    cap = cv2.VideoCapture(uri, cv2.CAP_FFMPEG)
    try:
        if not cap.isOpened():
            return False
        ok, _frame = cap.read()
        return bool(ok)
    finally:
        cap.release()


def main() -> int:
    if not FUNCTION_URL or not TOKEN:
        log.error("Set BIZORA_GATEWAY_URL and BIZORA_GATEWAY_TOKEN in the local environment.")
        return 2
    config = load_config()
    cameras = config["cameras"]
    for item in cameras:
        if not item.get("camera_id") or not item.get("rtsp_url"):
            raise ValueError("Every camera requires camera_id and rtsp_url in local cameras.json")
    log.info("Bizora Camera Gateway %s started; %d camera(s) configured", VERSION, len(cameras))
    while RUNNING:
        try:
            status = api("heartbeat", {"agent_version": VERSION, "capabilities": {"rtsp_probe": True, "opencv": cv2 is not None}})
            if status.get("processing_enabled", True):
                for camera in cameras:
                    try:
                        online = probe_rtsp(str(camera["rtsp_url"]))
                        api("camera_probe", {"camera_id": camera["camera_id"], "online": online})
                        log.info("Camera %s: %s", camera.get("label", camera["camera_id"]), "online" if online else "offline")
                    except Exception as exc:
                        log.warning("Probe failed for %s: %s", camera.get("label", camera["camera_id"]), exc)
                        try:
                            api("camera_probe", {"camera_id": camera["camera_id"], "online": False})
                        except Exception as api_exc:
                            log.error("Could not report camera status: %s", api_exc)
            else:
                log.info("Camera processing is paused; server heartbeat remains connected.")
        except Exception as exc:
            log.error("Gateway heartbeat/API error: %s", exc)
        for _ in range(INTERVAL):
            if not RUNNING:
                break
            time.sleep(1)
    log.info("Gateway stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
