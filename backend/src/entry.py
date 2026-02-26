from __future__ import annotations

from js import Headers, Response, fetch
import json
import os
from typing import Any, Dict, List


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


async def on_fetch(request, env):
    headers = Headers.new(
        [
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "*"),
        ]
    )

    if request.method == "OPTIONS":
        return Response.new("", headers=headers)

    url = request.url

    # --- Training data export ---
    if request.method == "GET" and "/api/training-data" in url:
        try:
            # Parse query params
            query_str = url.split("?", 1)[1] if "?" in url else ""
            params: Dict[str, str] = {}
            for pair in query_str.split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    params[k] = v

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

            print("DEBUG: Decoding CSV...")
            data_bytes = bytes(content_bytes)
            try:
                csv_str = data_bytes.decode("utf-8")
            except UnicodeDecodeError:
                print("DEBUG: UTF-8 decode failed, trying cp1252...")
                csv_str = data_bytes.decode("cp1252")

            metadata = _parse_aim_metadata(csv_str)

            print("DEBUG: Sending CSV to Lambda...")
            result = await _call_lambda(data_bytes, env)
            if not isinstance(result, dict):
                return Response.new(json.dumps({"error": "Invalid Lambda response"}), headers=headers, status=502)
            if "error" in result:
                print(f"DEBUG: Lambda error: {result['error']}")
                return Response.new(json.dumps({"error": result["error"]}), headers=headers, status=400)

            corners = result.get("corners")
            if corners is None:
                return Response.new(json.dumps({"error": "Lambda response missing corners"}), headers=headers, status=502)

            print(f"DEBUG: Found {len(corners)} corners. Saving to D1...")

            import datetime

            now = datetime.datetime.now().isoformat()
            lambda_metadata = result.get("metadata") if isinstance(result.get("metadata"), dict) else {}
            venue = str(lambda_metadata.get("Venue", metadata.get("Venue", "Unknown")))
            vehicle = str(lambda_metadata.get("Vehicle", metadata.get("Vehicle", "Unknown")))

            res = await env.DB.prepare("INSERT INTO Sessions (created_at, venue, vehicle) VALUES (?, ?, ?)").bind(
                now, venue, vehicle
            ).run()
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

            print(f"DEBUG: Exception in POST: {e}")
            traceback.print_exc()
            return Response.new(json.dumps({"error": str(e)}), headers=headers, status=500)

    return Response.new(json.dumps({"status": "ok"}), headers=headers)
