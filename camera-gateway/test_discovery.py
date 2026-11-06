import unittest
from discovery import parse_probe_response

RESPONSE = b"""<?xml version="1.0"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
 <Body><ProbeMatches><ProbeMatch>
  <Types>dn:NetworkVideoTransmitter</Types>
  <XAddrs>http://192.168.1.88:80/onvif/device_service</XAddrs>
  <Scopes>onvif://www.onvif.org/name/Hikvision-NVR onvif://www.onvif.org/hardware/DS-7608 onvif://www.onvif.org/serial/ABC123456</Scopes>
 </ProbeMatch></ProbeMatches></Body>
</Envelope>"""

class DiscoveryParsingTests(unittest.TestCase):
    def test_extracts_private_onvif_device(self):
        result = parse_probe_response(RESPONSE, "192.168.1.88")
        self.assertEqual(result["ip"], "192.168.1.88")
        self.assertEqual(result["model"], "DS-7608")
        self.assertEqual(result["serial"], "ABC123456")
        self.assertEqual(result["protocol"], "ONVIF")

    def test_rejects_public_xaddr(self):
        payload = RESPONSE.replace(b"192.168.1.88", b"8.8.8.8")
        self.assertIsNone(parse_probe_response(payload))

    def test_ignores_invalid_xml(self):
        self.assertIsNone(parse_probe_response(b"<broken"))

if __name__ == "__main__":
    unittest.main()
