from __future__ import annotations

from js import Headers, Response, fetch
import json
import os
import hmac
import hashlib
import base64
import time
from typing import Any, Dict, List, Optional
from urllib.parse import unquote


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


async def _call_gemini(prompt: str, env: Any) -> str:
    api_key = _get_env_value(env, "GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096},
    })

    resp_headers = Headers.new([
        ("Content-Type", "application/json"),
    ])
    response = await fetch(url, {
        "method": "POST",
        "headers": resp_headers,
        "body": body,
    })
    if not response.ok:
        error_text = await response.text()
        raise RuntimeError(f"Gemini API error {response.status}: {error_text}")

    result = await response.json()
    text = result["candidates"][0]["content"]["parts"][0]["text"]
    return text


async def _generate_report(body: Dict[str, Any], env: Any) -> Dict[str, Any]:
    prompt = body.get("prompt")
    if not prompt or not isinstance(prompt, str):
        raise ValueError("Missing or invalid 'prompt' field")

    report_text = await _call_gemini(prompt, env)
    return {"report": report_text}


async def _call_lambda(csv_bytes: bytes, env: Any) -> Dict[str, Any]:
    lambda_url = _get_env_value(env, "LAMBDA_URL")
    if not lambda_url:
        raise RuntimeError("Lambda URL not configured")

    header_items = [
        ("Content-Type", "text/csv"),
        ("Accept", "application/json"),
    ]
    token = _get_env_value(env, "LAMBDA_TOKEN")
    if token:
        header_items.append(("Authorization", f"Bearer {token}"))

    proxy_headers = Headers.new(header_items)
    response = await fetch(
        lambda_url,
        {
            "method": "POST",
            "headers": proxy_headers,
            "body": csv_bytes,
        },
    )
    if not response.ok:
        error_text = await response.text()
        raise RuntimeError(f"Lambda error {response.status}: {error_text}")

    return await response.json()


# ─── Auth Handlers ───

async def _handle_auth_google_token(request, env, headers):
    """Verify Google id_token and return our JWT. Uses GET to Google's tokeninfo (no outbound POST)."""
    jwt_secret = _get_env_value(env, "JWT_SECRET")
    client_id = _get_env_value(env, "GOOGLE_CLIENT_ID")
    if not jwt_secret or not client_id:
        return Response.new(json.dumps({"error": "Auth not configured"}), headers=headers, status=500)

    content_bytes = await request.bytes()
    body = json.loads(bytes(content_bytes).decode("utf-8"))
    id_token = body.get("id_token")
    if not id_token:
        return Response.new(json.dumps({"error": "Missing id_token"}), headers=headers, status=400)

    # Verify id_token via Google's tokeninfo endpoint (GET request)
    verify_resp = await fetch(f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}")
    if not verify_resp.ok:
        return Response.new(json.dumps({"error": "Invalid id_token"}), headers=headers, status=401)

    # verify_resp.json() returns JsProxy — parse text instead
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

    if not google_id or not email:
        return Response.new(json.dumps({"error": "Invalid token info"}), headers=headers, status=401)

    # Upsert user in D1
    existing = await env.DB.prepare("SELECT id FROM Users WHERE google_id = ?").bind(google_id).first()
    if existing:
        user_id = existing.id
        await env.DB.prepare(
            "UPDATE Users SET email = ?, name = ?, picture_url = ? WHERE id = ?"
        ).bind(email, name, picture, user_id).run()
    else:
        res = await env.DB.prepare(
            "INSERT INTO Users (google_id, email, name, picture_url) VALUES (?, ?, ?, ?)"
        ).bind(google_id, email, name, picture).run()
        user_id = res.meta.last_row_id

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

    if request.method == "GET" and "/api/auth/me" in url:
        return await _handle_auth_me(request, env, headers)

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
