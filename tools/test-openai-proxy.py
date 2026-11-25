#!/usr/bin/env python3
"""Offline integration tests for Scriptorium's localhost OpenAI adapter.

The tests exercise the real HTTP handler and replace only the upstream OpenAI
transport. They never need an API key, network access, or paid API usage.
"""
import http.client
import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("scriptorium_server", ROOT / "launcher" / "serve.py")
SERVER_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER_MODULE)


class FakeUpstream:
    def __init__(self, body, status=200, content_type="text/event-stream"):
        from email.message import Message

        self.status = status
        self.code = status
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["x-request-id"] = "req_test_123"
        self._chunks = [body, b""]

    def read1(self, _size):
        return self._chunks.pop(0) if self._chunks else b""


class OpenAIProxyRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = SERVER_MODULE.Server(("127.0.0.1", 0), SERVER_MODULE.Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        request_headers = {
            "Host": f"127.0.0.1:{self.port}",
            "Origin": f"http://127.0.0.1:{self.port}",
        }
        request_headers.update(headers or {})
        conn.request(method, path, body=body, headers=request_headers)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_info_reports_configuration_without_exposing_secret(self):
        secret = "sk-test-do-not-return"
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": secret, "OPENAI_MODEL": "gpt-test-model"}):
            status, headers, body = self.request("GET", "/__openai/info")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["model"], "gpt-test-model")
        self.assertEqual(payload["keyLocation"], "server environment")
        self.assertNotIn(secret.encode(), body)
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_models_route_exposes_selected_model_not_key(self):
        secret = "sk-test-model-route-secret"
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": secret, "OPENAI_MODEL": "gpt-test-model"}):
            status, _headers, body = self.request("GET", "/__openai/v1/models")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["data"][0]["id"], "gpt-test-model")
        self.assertNotIn(secret.encode(), body)

    def test_responses_route_forwards_payload_and_streamed_bytes(self):
        secret = "sk-test-upstream-secret"
        payload = {"model": "gpt-test-model", "input": "Explain this mechanism", "tools": [{"type": "web_search"}]}
        body = json.dumps(payload).encode()
        streamed = b'event: response.completed\ndata: {"type":"response.completed"}\n\n'
        upstream = FakeUpstream(streamed)
        captured = {}

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["authorization"] = req.get_header("Authorization")
            captured["body"] = req.data
            captured["timeout"] = timeout
            return upstream

        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": secret, "OPENAI_MODEL": "gpt-test-model"}):
            with mock.patch.object(SERVER_MODULE.urllib.request, "urlopen", side_effect=fake_urlopen):
                status, headers, returned = self.request(
                    "POST", "/__openai/v1/responses", body,
                    {"Content-Type": "application/json", "Accept": "text/event-stream"},
                )

        self.assertEqual(status, 200)
        self.assertEqual(captured["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(captured["authorization"], "Bearer " + secret)
        self.assertEqual(captured["body"], body)
        self.assertEqual(captured["timeout"], 600)
        self.assertEqual(returned, streamed)
        self.assertEqual(headers.get("Content-Type"), "text/event-stream")
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("x-request-id"), "req_test_123")

    def test_chat_completions_route_uses_compatibility_endpoint(self):
        secret = "sk-test-chat-secret"
        payload = {"model": "gpt-test-model", "messages": [{"role": "user", "content": "Hello"}]}
        captured = {}

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["body"] = req.data
            return FakeUpstream(b'{"choices":[]}', content_type="application/json")

        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": secret}):
            with mock.patch.object(SERVER_MODULE.urllib.request, "urlopen", side_effect=fake_urlopen):
                status, _headers, body = self.request(
                    "POST", "/__openai/v1/chat/completions", json.dumps(payload).encode(),
                    {"Content-Type": "application/json"},
                )
        self.assertEqual(status, 200)
        self.assertEqual(captured["url"], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(json.loads(body), {"choices": []})

    def test_upstream_error_status_is_preserved(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            with mock.patch.object(
                SERVER_MODULE.urllib.request, "urlopen",
                return_value=FakeUpstream(b'{"error":"rate limited"}', status=429, content_type="application/json"),
            ):
                status, _headers, body = self.request(
                    "POST", "/__openai/v1/responses",
                    json.dumps({"model": "gpt-test-model", "input": "test"}).encode(),
                    {"Content-Type": "application/json"},
                )
        self.assertEqual(status, 429)
        self.assertIn(b"rate limited", body)

    def test_missing_key_is_rejected_without_upstream_request(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with mock.patch.object(SERVER_MODULE.urllib.request, "urlopen") as upstream:
                status, _headers, _body = self.request("GET", "/__openai/v1/models")
        self.assertEqual(status, 503)
        upstream.assert_not_called()

    def test_invalid_json_and_incomplete_payload_are_rejected(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            status_bad_json, _headers, _body = self.request(
                "POST", "/__openai/v1/responses", b"{", {"Content-Type": "application/json"}
            )
            status_bad_shape, _headers, _body = self.request(
                "POST", "/__openai/v1/responses", b'{"input":"missing model"}',
                {"Content-Type": "application/json"},
            )
        self.assertEqual(status_bad_json, 400)
        self.assertEqual(status_bad_shape, 400)

    def test_cross_origin_and_dns_rebinding_hosts_are_rejected(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            cross_status, _headers, _body = self.request(
                "GET", "/__openai/info", headers={"Origin": "https://attacker.example"}
            )
            host_status, _headers, _body = self.request(
                "GET", "/__openai/info", headers={"Host": "attacker.example"}
            )
        self.assertEqual(cross_status, 403)
        self.assertEqual(host_status, 403)

    def test_oversized_body_is_rejected_before_reading_it(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("POST", "/__openai/v1/responses")
        conn.putheader("Host", f"127.0.0.1:{self.port}")
        conn.putheader("Origin", f"http://127.0.0.1:{self.port}")
        conn.putheader("Content-Length", str(24 * 1024 * 1024 + 1))
        conn.endheaders()
        response = conn.getresponse()
        status = response.status
        response.read()
        conn.close()
        self.assertEqual(status, 413)

    def test_unknown_openai_routes_are_not_forwarded(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            with mock.patch.object(SERVER_MODULE.urllib.request, "urlopen") as upstream:
                status, _headers, _body = self.request("POST", "/__openai/admin", b"{}")
        self.assertEqual(status, 404)
        upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
