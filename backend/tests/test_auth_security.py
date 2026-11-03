import unittest

from fastapi import HTTPException
from starlette.requests import Request

from app.core.security import (
    CSRF_COOKIE,
    CSRF_HEADER,
    HOST_SESSION_COOKIE,
    SESSION_COOKIE,
    require_browser_write,
    session_cookie_name,
    session_token,
)


def request_with_headers(
    *,
    origin: str | None = "http://localhost:3000",
    csrf_cookie: str | None = "csrf-token",
    csrf_header: str | None = "csrf-token",
    scheme: str = "http",
    cookies: str | None = None,
) -> Request:
    headers = []
    if origin is not None:
        headers.append((b"origin", origin.encode()))
    if csrf_header is not None:
        headers.append((b"x-csrf-token", csrf_header.encode()))
    cookie_header = cookies or (
        f"{CSRF_COOKIE}={csrf_cookie}" if csrf_cookie is not None else ""
    )
    if cookie_header:
        headers.append((b"cookie", cookie_header.encode()))
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": scheme,
        "path": "/api/auth/signin",
        "headers": headers,
        "query_string": b"",
        "server": ("localhost", 3000),
        "client": ("127.0.0.1", 1),
    }
    return Request(scope)


class AuthSecurityTests(unittest.TestCase):
    def test_matching_origin_and_csrf_are_accepted(self):
        require_browser_write(request_with_headers())

    def test_missing_origin_is_rejected(self):
        with self.assertRaises(HTTPException) as context:
            require_browser_write(request_with_headers(origin=None))
        self.assertEqual(context.exception.status_code, 403)

    def test_untrusted_origin_is_rejected(self):
        with self.assertRaises(HTTPException) as context:
            require_browser_write(request_with_headers(origin="https://attacker.example"))
        self.assertEqual(context.exception.status_code, 403)

    def test_missing_or_mismatched_csrf_is_rejected(self):
        for csrf_cookie, csrf_header in [(None, None), ("one", "two")]:
            with self.subTest(csrf_cookie=csrf_cookie, csrf_header=csrf_header):
                with self.assertRaises(HTTPException) as context:
                    require_browser_write(
                        request_with_headers(
                            csrf_cookie=csrf_cookie,
                            csrf_header=csrf_header,
                        )
                    )
                self.assertEqual(context.exception.status_code, 403)

    def test_cookie_selection_supports_local_and_https_names(self):
        self.assertEqual(session_cookie_name(request_with_headers()), SESSION_COOKIE)
        self.assertEqual(
            session_cookie_name(request_with_headers(scheme="https")),
            HOST_SESSION_COOKIE,
        )
        request = request_with_headers(
            cookies=f"{SESSION_COOKIE}=local-token; {CSRF_COOKIE}=csrf-token"
        )
        self.assertEqual(session_token(request), "local-token")

    def test_https_cookie_is_preferred_when_both_are_present(self):
        request = request_with_headers(
            cookies=f"{SESSION_COOKIE}=local-token; {HOST_SESSION_COOKIE}=secure-token; {CSRF_COOKIE}=csrf-token"
        )
        self.assertEqual(session_token(request), "secure-token")
