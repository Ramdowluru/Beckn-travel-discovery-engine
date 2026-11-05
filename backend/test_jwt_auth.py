"""
JWT Authentication Test Suite
Tests: signup, signin, token expiry, refresh, logout, CSRF, cross-user access
"""
import asyncio
import json
import jwt
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from fastapi.testclient import TestClient

import sys
sys.path.insert(0, str(__file__).rsplit('\\', 1)[0])

from app.core.config import settings
from app.main import app


def print_test(test_name: str, passed: bool, details: str = ""):
    """Pretty print test results."""
    status = "✓ PASS" if passed else "✗ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"  {details}")


async def run_tests():
    """Run JWT authentication tests."""
    print("\n" + "="*70)
    print("JWT AUTHENTICATION TEST SUITE")
    print("="*70)
    
    async with AsyncClient(app=app, base_url="http://localhost:8000") as client:
        # Get CSRF token first
        csrf_response = await client.get("/api/auth/csrf")
        csrf_cookie = csrf_response.cookies.get("tde_csrf")
        if not csrf_cookie:
            print("✗ FAIL: Could not get CSRF token")
            return
        
        print(f"\nCSRF Token obtained: {csrf_cookie[:20]}...")
        
        # Test 1: Password validation - too short
        print("\n--- Test 1: Password Validation (Too Short) ---")
        response = await client.post(
            "/api/auth/signup",
            json={"name": "Test User", "email": "test1@example.com", "password": "short"},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 422
        print_test("Reject password < 8 chars", passed, f"Status: {response.status_code}")
        
        # Test 2: Password validation - too long
        print("\n--- Test 2: Password Validation (Too Long) ---")
        response = await client.post(
            "/api/auth/signup",
            json={"name": "Test User", "email": "test2@example.com", "password": "a" * 129},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 422
        print_test("Reject password > 128 chars", passed, f"Status: {response.status_code}")
        
        # Test 3: Successful signup
        print("\n--- Test 3: Successful Signup ---")
        test_email = f"test_jwt_{int(datetime.now().timestamp())}@example.com"
        response = await client.post(
            "/api/auth/signup",
            json={"name": "JWT Test User", "email": test_email, "password": "ValidPassword123"},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 201
        body = response.json() if response.ok else {}
        user_id = body.get("user", {}).get("id")
        print_test("Signup succeeds with valid credentials", passed, f"Status: {response.status_code}, User: {user_id}")
        
        # Check JWT access token cookie is set
        access_token = response.cookies.get("tde_access_token") or response.cookies.get("__Host-tde_access_token")
        refresh_token = response.cookies.get("tde_refresh_token") or response.cookies.get("__Host-tde_refresh_token")
        passed = bool(access_token and refresh_token)
        print_test("Access & refresh tokens in cookies", passed, 
                  f"Access: {access_token[:20] if access_token else 'None'}..., Refresh: {refresh_token[:20] if refresh_token else 'None'}...")
        
        # Verify JWT signature and claims
        if access_token:
            try:
                decoded = jwt.decode(access_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                passed = decoded.get("sub") == user_id and "exp" in decoded and "iat" in decoded
                print_test("JWT signature valid and contains required claims", passed,
                          f"Sub: {decoded.get('sub')}, Has exp: {'exp' in decoded}, Has iat: {'iat' in decoded}")
            except Exception as e:
                print_test("JWT signature valid and contains required claims", False, f"Error: {e}")
        
        # Test 4: Signin with wrong password
        print("\n--- Test 4: Signin with Wrong Password ---")
        response = await client.post(
            "/api/auth/signin",
            json={"email": test_email, "password": "WrongPassword"},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 401
        print_test("Reject signin with wrong password", passed, f"Status: {response.status_code}")
        
        # Test 5: Successful signin
        print("\n--- Test 5: Successful Signin ---")
        response = await client.post(
            "/api/auth/signin",
            json={"email": test_email, "password": "ValidPassword123"},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 200
        body = response.json() if response.ok else {}
        print_test("Signin succeeds with correct password", passed, f"Status: {response.status_code}")
        
        new_access_token = response.cookies.get("tde_access_token") or response.cookies.get("__Host-tde_access_token")
        new_refresh_token = response.cookies.get("tde_refresh_token") or response.cookies.get("__Host-tde_refresh_token")
        passed = bool(new_access_token and new_refresh_token)
        print_test("New tokens issued on signin", passed, "Access and refresh cookies set")
        
        # Test 6: /me endpoint with valid token
        print("\n--- Test 6: GET /me with Valid Token ---")
        response = await client.get(
            "/api/auth/me",
            cookies={"tde_access_token": new_access_token} if new_access_token else {},
        )
        passed = response.status_code == 200
        body = response.json() if response.ok else {}
        me_user_id = body.get("user", {}).get("id")
        print_test("Access protected endpoint with valid JWT", passed, 
                  f"Status: {response.status_code}, User: {me_user_id}")
        
        # Test 7: /me endpoint without token
        print("\n--- Test 7: GET /me Without Token ---")
        response = await client.get("/api/auth/me")
        passed = response.status_code == 401
        print_test("Reject request without authentication token", passed, f"Status: {response.status_code}")
        
        # Test 8: Refresh token endpoint
        print("\n--- Test 8: Refresh Token Endpoint ---")
        response = await client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={
                "tde_csrf": csrf_cookie,
                "tde_refresh_token": new_refresh_token,
            } if new_refresh_token else {},
        )
        passed = response.status_code == 200
        refreshed_access_token = response.cookies.get("tde_access_token") or response.cookies.get("__Host-tde_access_token")
        print_test("Refresh endpoint issues new access token", passed, 
                  f"Status: {response.status_code}, New token: {refreshed_access_token[:20] if refreshed_access_token else 'None'}...")
        
        # Verify refreshed token is different and valid
        if refreshed_access_token and new_access_token:
            try:
                decoded = jwt.decode(refreshed_access_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                different = refreshed_access_token != new_access_token
                passed = different and decoded.get("sub") == user_id
                print_test("Refreshed token is new JWT with same user", passed,
                          f"Token changed: {different}, User match: {decoded.get('sub') == user_id}")
            except Exception as e:
                print_test("Refreshed token is new JWT with same user", False, f"Error: {e}")
        
        # Test 9: CSRF protection
        print("\n--- Test 9: CSRF Protection ---")
        response = await client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": "invalid_token"},
            cookies={"tde_csrf": csrf_cookie},
        )
        passed = response.status_code == 403
        print_test("Reject request with mismatched CSRF token", passed, f"Status: {response.status_code}")
        
        # Test 10: Logout revokes refresh token
        print("\n--- Test 10: Logout Revokes Refresh Token ---")
        response = await client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie, "tde_refresh_token": new_refresh_token} if new_refresh_token else {},
        )
        passed = response.status_code == 200
        print_test("Logout succeeds", passed, f"Status: {response.status_code}")
        
        # Try to use refresh token after logout
        response = await client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie, "tde_refresh_token": new_refresh_token} if new_refresh_token else {},
        )
        passed = response.status_code == 401
        print_test("Refresh token rejected after logout", passed, f"Status: {response.status_code}")
        
        # Test 11: Cross-user access prevention
        print("\n--- Test 11: Cross-User Access Prevention ---")
        # Create second user
        test_email_2 = f"test_jwt_2_{int(datetime.now().timestamp())}@example.com"
        response = await client.post(
            "/api/auth/signup",
            json={"name": "User 2", "email": test_email_2, "password": "ValidPassword456"},
            headers={"X-CSRF-Token": csrf_cookie},
            cookies={"tde_csrf": csrf_cookie},
        )
        user2_token = response.cookies.get("tde_access_token") or response.cookies.get("__Host-tde_access_token")
        
        # Try to use tampered token (modify sub claim)
        if user2_token:
            try:
                # Decode without verification to get original
                decoded = jwt.decode(user2_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                tampered_decoded = decoded.copy()
                tampered_decoded["sub"] = user_id  # Try to impersonate user 1
                tampered_token = jwt.encode(tampered_decoded, "wrong_secret", algorithm="HS256")
                
                response = await client.get(
                    "/api/auth/me",
                    cookies={"tde_access_token": tampered_token},
                )
                passed = response.status_code == 401
                print_test("Reject tampered JWT with wrong signature", passed, f"Status: {response.status_code}")
            except Exception as e:
                print_test("Reject tampered JWT with wrong signature", False, f"Error: {e}")
        
        print("\n" + "="*70)
        print("TEST SUITE COMPLETE")
        print("="*70)


if __name__ == "__main__":
    print("JWT Auth Test requires running backend server on http://localhost:8000")
    print("Run: python -m uvicorn app.main:app --reload")
    print("\nStarting tests in 2 seconds...")
    asyncio.sleep(2)
    try:
        asyncio.run(run_tests())
    except Exception as e:
        print(f"\n✗ Tests failed to run: {e}")
        print("Make sure the backend server is running.")
