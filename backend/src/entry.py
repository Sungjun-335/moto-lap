from __future__ import annotations

from js import Headers, Object, Response, URLSearchParams, fetch
from pyodide.ffi import to_js
import json
import os
import hmac
import hashlib
import base64
import time
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, quote, urlencode


def _js_headers(d: dict):
    """Convert Python dict to a JS object suitable for fetch headers."""
    return Object.fromEntries(to_js(d))


# ─── JWT Helpers (HS256, stdlib only) ───

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _create_jwt(payload: dict, secret: str, exp_seconds: int = 7 * 24 * 3600) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {**payload, "iat": int(time.time()), "exp": int(time.time()) + exp_seconds}
    segments = [
        _b64url_encode(json.dumps(header).encode()),
        _b64url_encode(json.dumps(payload).encode()),
    ]
    signing_input = ".".join(segments).encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    segments.append(_b64url_encode(signature))
    return ".".join(segments)


def _verify_jwt(token: str, secret: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        signing_input = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(parts[2])
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


async def _get_user_from_request(request, env) -> Optional[dict]:
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    if not jwt_secret:
        return None
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    return _verify_jwt(token, jwt_secret)


# ─── Admin Check ───

ADMIN_EMAILS = ['yy95211@gmail.com']


async def _require_admin(request, env) -> Optional[dict]:
    user = await _get_user_from_request(request, env)
    if not user or user.get("email") not in ADMIN_EMAILS:
        return None
    return user


# ─── Existing Helpers ───

def _flatten_driving(driving: dict) -> dict:
    """Flatten nested driving features dict into a single-level dict for CSV export."""
    flat: Dict[str, Any] = {}
    if not driving:
        return flat

    for section_key, section in driving.items():
        if section is None:
            continue
        if isinstance(section, dict):
            for field_key, value in section.items():
                flat[field_key] = value
        else:
            flat[section_key] = section

    return flat


def _is_aim_data_header(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    parts = [p.strip().strip('"') for p in stripped.split(",")]
    return len(parts) >= 2 and parts[0] == "Time" and parts[1] == "Distance"


def _parse_aim_metadata(csv_str: str) -> Dict[str, str]:
    metadata: Dict[str, str] = {}
    for line in csv_str.splitlines():
        if _is_aim_data_header(line):
            break

        if not line.strip():
            continue

        parts = line.strip().split(",")
        if len(parts) < 2:
            continue

        key = parts[0].strip('"')
        val = ",".join(parts[1:]).strip().strip('"')
        if key:
            metadata[key] = val

    return metadata


def _get_env_value(env: Any, key: str) -> str | None:
    value = getattr(env, key, None)
    if value:
        return str(value)
    return os.getenv(key)


def _parse_query_params(url: str) -> Dict[str, str]:
    query_str = url.split("?", 1)[1] if "?" in url else ""
    params: Dict[str, str] = {}
    for pair in query_str.split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            params[unquote(k)] = unquote(v)
    return params


def _make_cors_headers(request, env) -> Headers:
    origin = request.headers.get("Origin") or ""
    frontend_url = _get_env_value(env, "FRONTEND_URL") or ""

    allowed_origins = {"http://localhost:5173", "http://localhost:4173"}
    if frontend_url:
        allowed_origins.add(frontend_url)

    allow_origin = origin if origin in allowed_origins else (frontend_url or "http://localhost:5173")

    return Headers.new([
        ("Access-Control-Allow-Origin", allow_origin),
        ("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
        ("Access-Control-Allow-Credentials", "true"),
    ])


async def _call_gemini(prompt, env: Any) -> str:
    """Call Gemini API. prompt can be a str or dict {"system": "...", "user": "..."}."""
    api_key = _get_env_value(env, "GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    # Build request body supporting both plain string and structured prompt
    if isinstance(prompt, dict):
        system_text = prompt.get("system", "")
        user_text = prompt.get("user", "")
    else:
        system_text = ""
        user_text = str(prompt)

    req_body: Dict[str, Any] = {
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 65536},
    }

    if system_text:
        req_body["systemInstruction"] = {"parts": [{"text": system_text}]}

    response = await fetch(url,
        method="POST",
        headers=_js_headers({"Content-Type": "application/json"}),
        body=json.dumps(req_body),
    )
    if not response.ok:
        error_text = str(await response.text())
        raise RuntimeError(f"Gemini API error {response.status}: {error_text}")

    resp_text = await response.text()
    result = json.loads(str(resp_text))
    parts = result["candidates"][0]["content"]["parts"]

    # Filter out thinking parts (thought=true) and get the last text part
    text_parts = [p for p in parts if p.get("text") and not p.get("thought")]
    if not text_parts:
        # Fallback: try any part with text
        text_parts = [p for p in parts if p.get("text")]
    if not text_parts:
        raise RuntimeError("Gemini returned no text content")

    return text_parts[-1]["text"]


async def _generate_report(body: Dict[str, Any], env: Any) -> Dict[str, Any]:
    prompt = body.get("prompt")
    if not prompt:
        raise ValueError("Missing 'prompt' field")
    if not isinstance(prompt, (str, dict)):
        raise ValueError("'prompt' must be a string or {system, user} object")

    report_text = await _call_gemini(prompt, env)
    return {"report": report_text}


async def _call_lambda(csv_bytes: bytes, env: Any) -> Dict[str, Any]:
    lambda_url = _get_env_value(env, "LAMBDA_URL")
    if not lambda_url:
        raise RuntimeError("Lambda URL not configured")

    h = {"Content-Type": "text/csv", "Accept": "application/json"}
    token = _get_env_value(env, "LAMBDA_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"

    response = await fetch(lambda_url,
        method="POST",
        headers=_js_headers(h),
        body=csv_bytes,
    )
    if not response.ok:
        error_text = await response.text()
        raise RuntimeError(f"Lambda error {response.status}: {error_text}")

    return await response.json()


# ─── Auth Helpers ───

async def _upsert_user(env, provider: str, provider_id: str, email: str, name: str, picture: str) -> int:
    """Upsert user by provider. Returns user ID."""
    id_col = f"{provider}_id"

    existing = await env.DB.prepare(
        f"SELECT id FROM Users WHERE {id_col} = ?"
    ).bind(provider_id).first()

    if existing:
        user_id = existing.id
        await env.DB.prepare(
            "UPDATE Users SET email = ?, name = ?, picture_url = ? WHERE id = ?"
        ).bind(email, name, picture, user_id).run()
    else:
        # For non-Google providers, google_id (NOT NULL) gets '{provider}:{id}'
        google_id_value = provider_id if provider == "google" else f"{provider}:{provider_id}"
        res = await env.DB.prepare(
            f"INSERT INTO Users (google_id, email, name, picture_url, provider, {id_col})"
            f" VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(google_id_value, email, name, picture, provider, provider_id).run()
        user_id = res.meta.last_row_id

    return user_id


# ─── Auth Handlers ───

async def _handle_auth_google_token(request, env, headers):
    """Verify Google id_token or access_token and return our JWT. Uses only GET requests to Google."""
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    client_id = _get_env_value(env, "GOOGLE_CLIENT_ID")
    if not jwt_secret or not client_id:
        return Response.new(json.dumps({"error": "Auth not configured"}), headers=headers, status=500)

    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    id_token = body.get("id_token")
    access_token = body.get("access_token")

    if access_token:
        # Verify access_token via Google's userinfo endpoint (GET request)
        userinfo_resp = await fetch(f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={access_token}")
        if not userinfo_resp.ok:
            return Response.new(json.dumps({"error": "Invalid access_token"}), headers=headers, status=401)

        userinfo_text = await userinfo_resp.text()
        userinfo = json.loads(str(userinfo_text))

        google_id = str(userinfo.get("sub", ""))
        email = str(userinfo.get("email", ""))
        name = str(userinfo.get("name", ""))
        picture = str(userinfo.get("picture", ""))

    elif id_token:
        # Verify id_token via Google's tokeninfo endpoint (GET request)
        verify_resp = await fetch(f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}")
        if not verify_resp.ok:
            return Response.new(json.dumps({"error": "Invalid id_token"}), headers=headers, status=401)

        token_text = await verify_resp.text()
        token_dict = json.loads(str(token_text))

        # Verify audience matches our client ID
        aud = str(token_dict.get("aud", ""))
        if aud != client_id:
            return Response.new(json.dumps({"error": "Token audience mismatch"}), headers=headers, status=401)

        google_id = str(token_dict.get("sub", ""))
        email = str(token_dict.get("email", ""))
        name = str(token_dict.get("name", ""))
        picture = str(token_dict.get("picture", ""))

    else:
        return Response.new(json.dumps({"error": "Missing id_token or access_token"}), headers=headers, status=400)

    if not google_id or not email:
        return Response.new(json.dumps({"error": "Invalid token info"}), headers=headers, status=401)

    # Upsert user in D1
    user_id = await _upsert_user(env, "google", google_id, email, name, picture)

    # Create JWT
    jwt_token = _create_jwt({
        "sub": str(user_id),
        "email": email,
        "name": name,
        "picture": picture,
    }, jwt_secret)

    return Response.new(json.dumps({
        "token": jwt_token,
        "user": {"id": str(user_id), "email": email, "name": name, "picture": picture},
    }), headers=headers)


async def _handle_auth_google_code(request, env, headers):
    """Exchange Google authorization code for JWT (redirect flow)."""
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    client_id = _get_env_value(env, "GOOGLE_CLIENT_ID")
    client_secret = _get_env_value(env, "GOOGLE_CLIENT_SECRET")
    if not jwt_secret or not client_id or not client_secret:
        return Response.new(json.dumps({"error": "Google auth not configured"}), headers=headers, status=500)

    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    if not code or not redirect_uri:
        return Response.new(json.dumps({"error": "Missing code or redirect_uri"}), headers=headers, status=400)

    # Exchange code for tokens
    params = URLSearchParams.new()
    params.append("grant_type", "authorization_code")
    params.append("client_id", client_id)
    params.append("client_secret", client_secret)
    params.append("redirect_uri", redirect_uri)
    params.append("code", code)
    token_resp = await fetch("https://oauth2.googleapis.com/token",
        method="POST",
        headers=_js_headers({"Content-Type": "application/x-www-form-urlencoded"}),
        body=params,
    )
    if not token_resp.ok:
        error_text = str(await token_resp.text())
        return Response.new(json.dumps({"error": f"Google token exchange failed ({token_resp.status}): {error_text}"}), headers=headers, status=401)

    token_data = json.loads(str(await token_resp.text()))
    id_token = token_data.get("id_token")
    if not id_token:
        return Response.new(json.dumps({"error": "No id_token from Google"}), headers=headers, status=401)

    # Decode id_token payload (verified by server-side code exchange)
    parts = id_token.split(".")
    payload = json.loads(_b64url_decode(parts[1]))

    google_id = str(payload.get("sub", ""))
    email = str(payload.get("email", ""))
    name = str(payload.get("name", ""))
    picture = str(payload.get("picture", ""))

    if not google_id or not email:
        return Response.new(json.dumps({"error": "Invalid Google token"}), headers=headers, status=401)

    user_id = await _upsert_user(env, "google", google_id, email, name, picture)

    jwt_token = _create_jwt({
        "sub": str(user_id),
        "email": email,
        "name": name,
        "picture": picture,
    }, jwt_secret)

    return Response.new(json.dumps({
        "token": jwt_token,
        "user": {"id": str(user_id), "email": email, "name": name, "picture": picture},
    }), headers=headers)


async def _handle_auth_kakao_token(request, env, headers):
    """Exchange Kakao authorization code for JWT."""
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    kakao_client_id = _get_env_value(env, "KAKAO_CLIENT_ID")
    kakao_client_secret = _get_env_value(env, "KAKAO_CLIENT_SECRET")
    if not jwt_secret or not kakao_client_id:
        return Response.new(json.dumps({"error": "Kakao auth not configured"}), headers=headers, status=500)

    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    if not code or not redirect_uri:
        return Response.new(json.dumps({"error": "Missing code or redirect_uri"}), headers=headers, status=400)

    # 1. Exchange code for access_token
    params = URLSearchParams.new()
    params.append("grant_type", "authorization_code")
    params.append("client_id", kakao_client_id)
    params.append("redirect_uri", redirect_uri)
    params.append("code", code)
    if kakao_client_secret:
        params.append("client_secret", kakao_client_secret)

    token_resp = await fetch("https://kauth.kakao.com/oauth/token",
        method="POST",
        headers=_js_headers({"Content-Type": "application/x-www-form-urlencoded"}),
        body=params,
    )
    if not token_resp.ok:
        error_text = await token_resp.text()
        return Response.new(json.dumps({"error": f"Kakao token exchange failed: {error_text}"}), headers=headers, status=401)

    token_data = json.loads(str(await token_resp.text()))
    access_token = token_data.get("access_token")
    if not access_token:
        return Response.new(json.dumps({"error": "No access_token from Kakao"}), headers=headers, status=401)

    # 2. Get user info
    user_resp = await fetch("https://kapi.kakao.com/v2/user/me",
        method="GET",
        headers=_js_headers({"Authorization": f"Bearer {access_token}"}),
    )
    if not user_resp.ok:
        return Response.new(json.dumps({"error": "Failed to get Kakao user info"}), headers=headers, status=401)

    user_data = json.loads(str(await user_resp.text()))
    kakao_id = str(user_data.get("id", ""))
    kakao_account = user_data.get("kakao_account") or {}
    profile = kakao_account.get("profile") or {}
    email = str(kakao_account.get("email", ""))
    name = str(profile.get("nickname", ""))
    picture = str(profile.get("profile_image_url", ""))

    if not kakao_id:
        return Response.new(json.dumps({"error": "Invalid Kakao user info"}), headers=headers, status=401)

    # 3. Upsert + JWT
    user_id = await _upsert_user(env, "kakao", kakao_id, email, name, picture)

    jwt_token = _create_jwt({
        "sub": str(user_id),
        "email": email,
        "name": name,
        "picture": picture,
    }, jwt_secret)

    return Response.new(json.dumps({
        "token": jwt_token,
        "user": {"id": str(user_id), "email": email, "name": name, "picture": picture},
    }), headers=headers)


async def _handle_auth_naver_token(request, env, headers):
    """Exchange Naver authorization code for JWT."""
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    naver_client_id = _get_env_value(env, "NAVER_CLIENT_ID")
    naver_client_secret = _get_env_value(env, "NAVER_CLIENT_SECRET")
    if not jwt_secret or not naver_client_id or not naver_client_secret:
        return Response.new(json.dumps({"error": "Naver auth not configured"}), headers=headers, status=500)

    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    code = body.get("code")
    state = body.get("state")
    if not code:
        return Response.new(json.dumps({"error": "Missing code"}), headers=headers, status=400)

    # 1. Exchange code for access_token
    params = URLSearchParams.new()
    params.append("grant_type", "authorization_code")
    params.append("client_id", naver_client_id)
    params.append("client_secret", naver_client_secret)
    params.append("code", code)
    if state:
        params.append("state", state)

    token_resp = await fetch("https://nid.naver.com/oauth2.0/token",
        method="POST",
        headers=_js_headers({"Content-Type": "application/x-www-form-urlencoded"}),
        body=params,
    )
    if not token_resp.ok:
        error_text = await token_resp.text()
        return Response.new(json.dumps({"error": f"Naver token exchange failed: {error_text}"}), headers=headers, status=401)

    token_data = json.loads(str(await token_resp.text()))
    access_token = token_data.get("access_token")
    if not access_token:
        return Response.new(json.dumps({"error": "No access_token from Naver"}), headers=headers, status=401)

    # 2. Get user info
    user_resp = await fetch("https://openapi.naver.com/v1/nid/me",
        method="GET",
        headers=_js_headers({"Authorization": f"Bearer {access_token}"}),
    )
    if not user_resp.ok:
        return Response.new(json.dumps({"error": "Failed to get Naver user info"}), headers=headers, status=401)

    user_data = json.loads(str(await user_resp.text()))
    naver_response = user_data.get("response") or {}
    naver_id = str(naver_response.get("id", ""))
    email = str(naver_response.get("email", ""))
    name = str(naver_response.get("name", ""))
    picture = str(naver_response.get("profile_image", ""))

    if not naver_id:
        return Response.new(json.dumps({"error": "Invalid Naver user info"}), headers=headers, status=401)

    # 3. Upsert + JWT
    user_id = await _upsert_user(env, "naver", naver_id, email, name, picture)

    jwt_token = _create_jwt({
        "sub": str(user_id),
        "email": email,
        "name": name,
        "picture": picture,
    }, jwt_secret)

    return Response.new(json.dumps({
        "token": jwt_token,
        "user": {"id": str(user_id), "email": email, "name": name, "picture": picture},
    }), headers=headers)


async def _handle_auth_me(request, env, headers):
    user = await _get_user_from_request(request, env)
    if not user:
        return Response.new(json.dumps({"error": "Unauthorized"}), headers=headers, status=401)

    return Response.new(json.dumps({
        "id": user.get("sub"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
    }), headers=headers)


async def _handle_venue_stats(request, env, headers):
    """Compute per-venue rider statistics and percentile ranking."""
    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    venue = body.get("venue", "")
    user_metrics = body.get("metrics")  # optional: {lap_time_s, max_braking_g, ...}

    if not venue:
        return Response.new(json.dumps({"error": "Missing venue"}), headers=headers, status=400)

    # Query A: LapMetrics per session
    lap_rows = await env.DB.prepare(
        "SELECT lm.session_id, lm.lap_id, lm.lap_time_s, lm.mean_g_sum, lm.max_g_sum, lm.max_lean_deg"
        " FROM LapMetrics lm"
        " JOIN Sessions s ON lm.session_id = s.id"
        " WHERE s.venue = ? AND lm.lap_time_s IS NOT NULL"
    ).bind(venue).all()

    # Query B: Corners with driving data
    corner_rows = await env.DB.prepare(
        "SELECT c.session_id, c.lap_id, c.driving_json"
        " FROM Corners c"
        " JOIN Sessions s ON c.session_id = s.id"
        " WHERE s.venue = ? AND c.driving_json IS NOT NULL"
    ).bind(venue).all()

    # Build session -> laps mapping
    session_laps: Dict[int, list] = {}
    for row in lap_rows.results:
        sid = row.session_id
        if sid not in session_laps:
            session_laps[sid] = []
        session_laps[sid].append({
            "lap_id": row.lap_id,
            "lap_time_s": row.lap_time_s,
            "mean_g_sum": row.mean_g_sum,
            "max_g_sum": row.max_g_sum,
            "max_lean_deg": row.max_lean_deg,
        })

    # Build session -> lap -> corners mapping
    session_corners: Dict[int, Dict[int, list]] = {}
    for row in corner_rows.results:
        sid = row.session_id
        lid = row.lap_id
        if sid not in session_corners:
            session_corners[sid] = {}
        if lid not in session_corners[sid]:
            session_corners[sid][lid] = []
        driving = json.loads(row.driving_json) if row.driving_json else {}
        session_corners[sid][lid].append(driving)

    # Compute per-session stats
    session_stats: List[dict] = []
    for sid, laps in session_laps.items():
        valid_laps = [l for l in laps if l["lap_time_s"] is not None]
        if not valid_laps:
            continue
        best_lap = min(valid_laps, key=lambda l: l["lap_time_s"])
        best_lap_time = best_lap["lap_time_s"]
        best_lap_id = best_lap["lap_id"]

        max_mean_g_sum = max((l["mean_g_sum"] for l in valid_laps if l["mean_g_sum"] is not None), default=None)
        max_lean_deg = max((l["max_lean_deg"] for l in valid_laps if l["max_lean_deg"] is not None), default=None)

        best_corners = session_corners.get(sid, {}).get(best_lap_id, [])

        # Max braking G (absolute value of min_accel_x_g)
        max_braking_g = None
        for drv in best_corners:
            bp = drv.get("braking_profile") or {}
            min_ax = bp.get("min_accel_x_g")
            if min_ax is not None:
                abs_val = abs(min_ax)
                if max_braking_g is None or abs_val > max_braking_g:
                    max_braking_g = abs_val

        # Trail braking quality
        total_corners = len(best_corners)
        trail_braking_count = 0
        g_dip_ratios: List[float] = []
        eob_sol_overlap_count = 0

        for drv in best_corners:
            bp = drv.get("braking_profile") or {}
            lp = drv.get("lean_profile") or {}
            gd = drv.get("g_dip") or {}

            eob = bp.get("eob_offset_s")
            sol = lp.get("sol_offset_s")
            if eob is not None and sol is not None and eob > sol:
                trail_braking_count += 1
                eob_sol_overlap_count += 1

            ratio = gd.get("g_dip_ratio")
            if ratio is not None:
                g_dip_ratios.append(ratio)

        if total_corners > 0:
            tb_pct = trail_braking_count / total_corners * 100
            overlap_pct = eob_sol_overlap_count / total_corners * 100
            avg_gdip = (sum(g_dip_ratios) / len(g_dip_ratios) * 100) if g_dip_ratios else 0
            trail_quality = 0.4 * tb_pct + 0.3 * avg_gdip + 0.3 * overlap_pct
        else:
            trail_quality = None

        # Coasting penalty (sum across best lap corners)
        coasting_total = 0.0
        has_coasting = False
        for drv in best_corners:
            cp = drv.get("coasting_penalty") or {}
            cst = cp.get("cst_total_time_s")
            if cst is not None:
                coasting_total += cst
                has_coasting = True

        session_stats.append({
            "lap_time_s": best_lap_time,
            "max_braking_g": max_braking_g,
            "trail_braking_quality": round(trail_quality, 1) if trail_quality is not None else None,
            "mean_g_sum": max_mean_g_sum,
            "max_lean_deg": max_lean_deg,
            "coasting_penalty_s": round(coasting_total, 3) if has_coasting else None,
        })

    total_sessions = len(session_stats)
    sufficient_data = total_sessions >= 5

    if total_sessions == 0:
        return Response.new(json.dumps({
            "venue": venue,
            "total_sessions": 0,
            "sufficient_data": False,
            "distributions": {},
            "session_stats": None,
        }), headers=headers)

    # Helper: percentile value from sorted list
    def _pval(sv, p):
        n = len(sv)
        if n == 0:
            return None
        if n == 1:
            return sv[0]
        idx = p / 100.0 * (n - 1)
        lo = int(idx)
        hi = min(lo + 1, n - 1)
        frac = idx - lo
        return round(sv[lo] + frac * (sv[hi] - sv[lo]), 3)

    metrics_config = [
        ("lap_time_s", True),            # lower is better
        ("max_braking_g", False),         # higher is better
        ("trail_braking_quality", False), # higher is better
        ("mean_g_sum", False),            # higher is better
        ("max_lean_deg", False),          # higher is better
        ("coasting_penalty_s", True),     # lower is better
    ]

    distributions: Dict[str, Any] = {}
    for metric, _ in metrics_config:
        values = sorted(v[metric] for v in session_stats if v[metric] is not None)
        if values:
            distributions[metric] = {
                "min": round(values[0], 3),
                "p25": _pval(values, 25),
                "median": _pval(values, 50),
                "p75": _pval(values, 75),
                "max": round(values[-1], 3),
            }

    # Compute percentiles for user's metrics
    session_result = None
    if user_metrics and isinstance(user_metrics, dict):
        percentiles: Dict[str, Any] = {}
        for metric, lower_better in metrics_config:
            val = user_metrics.get(metric)
            if val is None:
                continue
            all_vals = [v[metric] for v in session_stats if v[metric] is not None]
            if not all_vals:
                continue
            n = len(all_vals)
            if lower_better:
                rank = sum(1 for v in all_vals if v < val) + 1
            else:
                rank = sum(1 for v in all_vals if v > val) + 1
            pctile = round((1 - rank / n) * 100)
            percentiles[metric] = {
                "value": round(val, 3),
                "percentile": max(0, pctile),
                "rank": rank,
                "total": n,
            }
        session_result = {"percentiles": percentiles}

    return Response.new(json.dumps({
        "venue": venue,
        "total_sessions": total_sessions,
        "sufficient_data": sufficient_data,
        "distributions": distributions,
        "session_stats": session_result,
    }), headers=headers)


async def _handle_get_sessions(request, env, headers):
    user = await _get_user_from_request(request, env)
    if not user:
        return Response.new(json.dumps({"error": "Unauthorized"}), headers=headers, status=401)

    user_id = int(user["sub"])
    result = await env.DB.prepare(
        "SELECT id, created_at, venue, vehicle FROM Sessions WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(user_id).all()

    sessions = []
    for row in result.results:
        sessions.append({
            "id": row.id,
            "created_at": row.created_at,
            "venue": row.venue,
            "vehicle": row.vehicle,
        })

    return Response.new(json.dumps({"sessions": sessions}), headers=headers)


# ─── Main Handler ───

async def on_fetch(request, env):
    headers = _make_cors_headers(request, env)

    if request.method == "OPTIONS":
        return Response.new("", headers=headers)

    url = request.url

    # --- Auth routes ---
    if request.method == "POST" and "/api/auth/google-token" in url:
        try:
            return await _handle_auth_google_token(request, env, headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "POST" and "/api/auth/google/token" in url:
        try:
            return await _handle_auth_google_code(request, env, headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "POST" and "/api/auth/kakao/token" in url:
        try:
            return await _handle_auth_kakao_token(request, env, headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "POST" and "/api/auth/naver/token" in url:
        try:
            return await _handle_auth_naver_token(request, env, headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "GET" and "/api/auth/me" in url:
        return await _handle_auth_me(request, env, headers)

    # --- Venue stats ---
    if request.method == "POST" and "/api/stats/venue" in url:
        try:
            return await _handle_venue_stats(request, env, headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    # --- Session list (authenticated) ---
    if request.method == "GET" and "/api/sessions" in url:
        return await _handle_get_sessions(request, env, headers)

    # --- Tracks API ---
    if request.method == "GET" and "/api/tracks" in url and "/api/training-data" not in url:
        try:
            result = await env.DB.prepare(
                "SELECT id, name, short_name, country, location_lat, location_lon,"
                " total_length, direction, centerline_json, corners_json,"
                " boundaries_json, editor_data_json, updated_at"
                " FROM Tracks ORDER BY name"
            ).all()

            tracks = []
            for row in result.results:
                track = {
                    "id": row.id,
                    "name": row.name,
                    "shortName": row.short_name,
                    "country": row.country,
                    "location": {"lat": row.location_lat, "lon": row.location_lon},
                    "totalLength": row.total_length,
                    "direction": row.direction,
                    "centerline": json.loads(row.centerline_json),
                    "corners": json.loads(row.corners_json),
                }
                if row.boundaries_json:
                    track["boundaries"] = json.loads(row.boundaries_json)
                if row.editor_data_json:
                    track["editorData"] = json.loads(row.editor_data_json)
                tracks.append(track)

            return Response.new(json.dumps({"tracks": tracks}), headers=headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "PUT" and "/api/tracks/" in url:
        try:
            admin = await _require_admin(request, env)
            if not admin:
                return Response.new(json.dumps({"error": "Forbidden"}), headers=headers, status=403)

            # Extract track ID from URL: /api/tracks/{id}
            track_id = url.split("/api/tracks/")[1].split("?")[0].split("/")[0]

            content_bytes = await request.bytes()
            body = json.loads(bytes(content_bytes).decode("utf-8"))

            location = body.get("location", {})
            boundaries = body.get("boundaries")
            editor_data = body.get("editorData")

            await env.DB.prepare(
                "INSERT OR REPLACE INTO Tracks"
                " (id, name, short_name, country, location_lat, location_lon,"
                "  total_length, direction, centerline_json, corners_json,"
                "  boundaries_json, editor_data_json, updated_at, updated_by)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)"
            ).bind(
                track_id,
                body.get("name", ""),
                body.get("shortName", ""),
                body.get("country", ""),
                location.get("lat", 0),
                location.get("lon", 0),
                body.get("totalLength", 0),
                body.get("direction", ""),
                json.dumps(body.get("centerline", [])),
                json.dumps(body.get("corners", [])),
                json.dumps(boundaries) if boundaries else None,
                json.dumps(editor_data) if editor_data else None,
                int(admin["sub"]),
            ).run()

            return Response.new(json.dumps({"ok": True, "id": track_id}), headers=headers)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    # --- Training data export ---
    if request.method == "GET" and "/api/training-data" in url:
        try:
            params = _parse_query_params(url)

            fmt = params.get("format", "json")
            venue_filter = params.get("venue", "")
            limit = int(params.get("limit", "10000"))
            offset = int(params.get("offset", "0"))

            sql = (
                "SELECT session_id, corner_index, lap_id, venue, direction,"
                " duration_s, entry_speed, min_speed, exit_speed, apex_speed, driving_json"
                " FROM Corners WHERE duration_s IS NOT NULL"
            )
            bind_values: List[Any] = []

            if venue_filter:
                sql += " AND venue = ?"
                bind_values.append(venue_filter)

            sql += " ORDER BY session_id, corner_index LIMIT ? OFFSET ?"
            bind_values.append(limit)
            bind_values.append(offset)

            stmt = env.DB.prepare(sql)
            if bind_values:
                stmt = stmt.bind(*bind_values)
            result = await stmt.all()

            rows = []
            for row in result.results:
                flat: Dict[str, Any] = {
                    "session_id": row.session_id,
                    "corner_index": row.corner_index,
                    "lap_id": row.lap_id,
                    "venue": row.venue,
                    "direction": row.direction,
                    "entry_speed": row.entry_speed,
                    "min_speed": row.min_speed,
                    "exit_speed": row.exit_speed,
                    "apex_speed": row.apex_speed,
                    "duration_s": row.duration_s,
                }
                driving = json.loads(row.driving_json) if row.driving_json else {}
                flat.update(_flatten_driving(driving))
                rows.append(flat)

            if fmt == "csv":
                if not rows:
                    csv_headers = Headers.new([
                        ("Access-Control-Allow-Origin", "*"),
                        ("Content-Type", "text/csv"),
                    ])
                    return Response.new("", headers=csv_headers)

                all_keys = list(rows[0].keys())
                for r in rows[1:]:
                    for k in r:
                        if k not in all_keys:
                            all_keys.append(k)

                lines = [",".join(all_keys)]
                for r in rows:
                    line_vals = []
                    for k in all_keys:
                        v = r.get(k)
                        if v is None:
                            line_vals.append("")
                        else:
                            line_vals.append(str(v))
                    lines.append(",".join(line_vals))

                csv_headers = Headers.new([
                    ("Access-Control-Allow-Origin", "*"),
                    ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
                    ("Access-Control-Allow-Headers", "*"),
                    ("Content-Type", "text/csv"),
                    ("Content-Disposition", "attachment; filename=training_data.csv"),
                ])
                return Response.new("\n".join(lines), headers=csv_headers)
            else:
                return Response.new(json.dumps({"rows": rows, "count": len(rows)}), headers=headers)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "POST" and url.endswith("/api/reports/generate"):
        try:
            content_bytes = await request.bytes()
            body = json.loads(bytes(content_bytes).decode("utf-8"))
            result = await _generate_report(body, env)
            return Response.new(json.dumps(result), headers=headers)
        except ValueError as e:
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    if request.method == "POST" and url.endswith("/api/sessions"):
        try:
            content_bytes = await request.bytes()

            data_bytes = bytes(content_bytes)
            try:
                csv_str = data_bytes.decode("utf-8")
            except UnicodeDecodeError:
                csv_str = data_bytes.decode("cp1252")

            metadata = _parse_aim_metadata(csv_str)

            result = await _call_lambda(data_bytes, env)
            if not isinstance(result, dict):
                return Response.new(json.dumps({"error": "Invalid Lambda response"}), headers=headers, status=502)
            if "error" in result:
                return Response.new(json.dumps({"error": result["error"]}), headers=headers, status=400)

            corners = result.get("corners")
            if corners is None:
                return Response.new(json.dumps({"error": "Lambda response missing corners"}), headers=headers, status=502)


            import datetime

            now = datetime.datetime.now().isoformat()
            lambda_metadata = result.get("metadata") if isinstance(result.get("metadata"), dict) else {}
            venue = str(lambda_metadata.get("Venue", metadata.get("Venue", "Unknown")))
            vehicle = str(lambda_metadata.get("Vehicle", metadata.get("Vehicle", "Unknown")))

            # Extract user_id from JWT if authenticated
            user = await _get_user_from_request(request, env)
            user_id = int(user["sub"]) if user else None

            res = await env.DB.prepare(
                "INSERT INTO Sessions (created_at, venue, vehicle, user_id) VALUES (?, ?, ?, ?)"
            ).bind(now, venue, vehicle, user_id).run()
            session_id = res.meta.last_row_id

            stmt = env.DB.prepare(
                "INSERT INTO Corners (session_id, corner_index, lap_id, start_time, end_time, duration_s, direction, venue, min_speed, entry_speed, exit_speed, apex_speed, driving_json)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            for c in corners:
                metrics = c.get("metrics", {})
                driving = c.get("driving")
                driving_str = json.dumps(driving) if driving else None
                await stmt.bind(
                    session_id,
                    c.get("corner_id"),
                    c.get("lap_id"),
                    c.get("start_time"),
                    c.get("end_time"),
                    c.get("duration_s"),
                    c.get("direction"),
                    venue,
                    metrics.get("min_speed"),
                    metrics.get("entry_speed"),
                    metrics.get("exit_speed"),
                    metrics.get("apex_speed"),
                    driving_str,
                ).run()

            lap_metrics_list = result.get("lap_metrics", [])
            if lap_metrics_list:
                lm_stmt = env.DB.prepare(
                    "INSERT INTO LapMetrics (session_id, lap_id, lap_time_s,"
                    " brk_time_s, brk_pct, brk_dist_m,"
                    " crn_time_s, crn_pct, crn_dist_m,"
                    " tps_time_s, tps_pct, tps_dist_m,"
                    " cst_time_s, cst_pct, cst_dist_m,"
                    " max_lean_deg, mean_g_sum, max_g_sum)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )
                for lm in lap_metrics_list:
                    await lm_stmt.bind(
                        session_id,
                        lm.get("lap_id"),
                        lm.get("lap_time_s"),
                        lm.get("brk_time_s"),
                        lm.get("brk_pct"),
                        lm.get("brk_dist_m"),
                        lm.get("crn_time_s"),
                        lm.get("crn_pct"),
                        lm.get("crn_dist_m"),
                        lm.get("tps_time_s"),
                        lm.get("tps_pct"),
                        lm.get("tps_dist_m"),
                        lm.get("cst_time_s"),
                        lm.get("cst_pct"),
                        lm.get("cst_dist_m"),
                        lm.get("max_lean_deg"),
                        lm.get("mean_g_sum"),
                        lm.get("max_g_sum"),
                    ).run()

            return Response.new(json.dumps({"session_id": str(session_id), "corners": corners, "lap_metrics": lap_metrics_list}), headers=headers)
        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    return Response.new(json.dumps({"status": "ok"}), headers=headers)
