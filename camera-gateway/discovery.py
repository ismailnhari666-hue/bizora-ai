#!/usr/bin/env python3
"""Safe ONVIF WS-Discovery for devices on the gateway's local IPv4 LAN.

This sends the standard WS-Discovery Probe to the ONVIF multicast address.
It does not brute-force ports, authenticate to devices, or read video streams.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import socket
import time
import uuid
from defusedxml import ElementTree as ET
from urllib.parse import unquote, urlparse

MULTICAST_GROUP = "239.255.255.250"
MULTICAST_PORT = 3702
PROBE_TIMEOUT_SECONDS = 5.0
MAX_DATAGRAM_BYTES = 65507

SOAP_PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
 <e:Header>
  <w:MessageID>urn:uuid:{message_id}</w:MessageID>
  <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
  <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
 </e:Header>
 <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>"""


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _private_ipv4_from_xaddr(value: str) -> str | None:
    try:
        host = urlparse(value.strip()).hostname
        if not host:
            return None
        address = ipaddress.ip_address(host)
        if isinstance(address, ipaddress.IPv4Address) and address.is_private and not address.is_loopback and not address.is_link_local:
            return str(address)
    except ValueError:
        return None
    return None


def parse_probe_response(payload: bytes, source_ip: str | None = None) -> dict | None:
    """Parse an ONVIF ProbeMatch without trusting XML text or remote hostnames."""
    try:
        root = ET.fromstring(payload)
    except (ET.ParseError, ValueError):
        return None

    xaddrs: list[str] = []
    scopes: list[str] = []
    types: list[str] = []
    for node in root.iter():
        name = _local_name(node.tag)
        value = (node.text or "").strip()
        if not value:
            continue
        if name == "xaddrs":
            xaddrs.extend(value.split())
        elif name == "scopes":
            scopes.extend(unquote(item) for item in value.split())
        elif name == "types":
            types.extend(value.split())

    valid = []
    for xaddr in xaddrs:
        ip = _private_ipv4_from_xaddr(xaddr)
        if ip:
            valid.append({"url": xaddr, "ip": ip})
    if not valid and source_ip:
        try:
            ip_obj = ipaddress.ip_address(source_ip)
            if isinstance(ip_obj, ipaddress.IPv4Address) and ip_obj.is_private and not ip_obj.is_loopback and not ip_obj.is_link_local:
                valid.append({"url": None, "ip": str(ip_obj)})
        except ValueError:
            pass
    if not valid:
        return None

    metadata = {}
    for scope in scopes:
        clean = scope.rstrip("/").split("/")[-1]
        if "=" in clean:
            key, value = clean.split("=", 1)
            key = key.lower()
            if key in {"name", "hardware", "manufacturer", "model", "serial", "location"}:
                metadata[key] = value[:160]

    return {
        "ip": valid[0]["ip"],
        "xaddrs": [item["url"] for item in valid if item["url"]],
        "types": types[:12],
        "scopes": scopes[:24],
        "manufacturer": metadata.get("manufacturer"),
        "model": metadata.get("hardware") or metadata.get("model"),
        "serial": metadata.get("serial"),
        "name": metadata.get("name"),
        "protocol": "ONVIF",
    }


def discover_onvif_devices(timeout: float = PROBE_TIMEOUT_SECONDS, interface_ip: str = "0.0.0.0") -> list[dict]:
    """Discover ONVIF transmitters via multicast on the gateway's attached LAN."""
    timeout = min(max(float(timeout), 1.0), 15.0)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    if interface_ip != "0.0.0.0":
        ipaddress.IPv4Address(interface_ip)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface_ip))
    sock.settimeout(0.35)
    found: dict[str, dict] = {}
    try:
        message = SOAP_PROBE.format(message_id=uuid.uuid4())
        sock.sendto(message.encode("utf-8"), (MULTICAST_GROUP, MULTICAST_PORT))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                payload, address = sock.recvfrom(MAX_DATAGRAM_BYTES)
            except socket.timeout:
                continue
            device = parse_probe_response(payload, address[0])
            if device:
                found[device["ip"]] = device
    finally:
        sock.close()
    return sorted(found.values(), key=lambda item: item["ip"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover ONVIF DVR/NVR/IP cameras on this local network")
    parser.add_argument("--timeout", type=float, default=PROBE_TIMEOUT_SECONDS, help="Listen window in seconds (1-15)")
    parser.add_argument("--interface", default="0.0.0.0", help="Local IPv4 interface, e.g. 192.168.1.20")
    args = parser.parse_args()
    devices = discover_onvif_devices(args.timeout, args.interface)
    print(json.dumps({"protocol": "ONVIF", "count": len(devices), "devices": devices}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
