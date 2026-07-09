"""
Vercel Serverless Function — Refresh XOS déchet dashboard data.
Called by the "Actualiser" button on the dashboard.

Flow:
1. Check rate limit (min 1h between refreshes) by reading current dashboard_data.json
2. Refresh Salesforce access token using refresh_token
3. SOQL: fetch all open opps with CloseDate < today
4. Score each opp (same logic as compute_and_score.py)
5. Return fresh JSON

Env vars needed (set on Vercel):
- SF_CLIENT_ID
- SF_CLIENT_SECRET
- SF_REFRESH_TOKEN
- SF_INSTANCE_URL
- SF_LOGIN_URL
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import date, datetime, timedelta


def handler(req):
    """Vercel Python handler — receives the request, returns JSON response."""
    try:
        # ── Rate limit: check if current data is fresh enough ──
        min_refresh_minutes = 30  # minimum 30 min between refreshes
        current_data_path = os.path.join(os.path.dirname(__file__), "..", "dashboard_data.json")
        if os.path.exists(current_data_path):
            try:
                with open(current_data_path) as f:
                    current = json.load(f)
                gen_at = current.get("generated_at", "")
                if gen_at:
                    gen_dt = datetime.fromisoformat(gen_at.replace("Z", "+00:00"))
                    age = (datetime.now(gen_dt.tzinfo) - gen_dt).total_seconds() / 60
                    if age < min_refresh_minutes:
                        return {
                            "statusCode": 429,
                            "body": json.dumps({
                                "error": "rate_limited",
                                "message": f"Dernière actualisation il y a {int(age)} min. Minimum {min_refresh_minutes} min entre deux refresh.",
                                "minutes_until_allowed": int(min_refresh_minutes - age),
                                "current_data_age_minutes": round(age, 1)
                            }),
                            "headers": {"Content-Type": "application/json"}
                        }
            except Exception:
                pass  # If we can't read current data, proceed anyway

        # ── 1. Refresh Salesforce access token ──
        client_id = os.environ.get("SF_CLIENT_ID", "")
        client_secret = os.environ.get("SF_CLIENT_SECRET", "")
        refresh_token = os.environ.get("SF_REFRESH_TOKEN", "")
        login_url = os.environ.get("SF_LOGIN_URL", "https://login.salesforce.com")
        instance_url = os.environ.get("SF_INSTANCE_URL", "https://db0000000d7rdeay.my.salesforce.com")

        if not all([client_id, client_secret, refresh_token]):
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "missing_env", "message": "SF credentials not configured in Vercel env vars"}),
                "headers": {"Content-Type": "application/json"}
            }

        token_url = f"{login_url}/services/oauth2/token"
        token_data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        }).encode()

        token_req = urllib.request.Request(token_url, data=token_data, method="POST")
        token_req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(token_req, timeout=30) as resp:
            token_resp = json.loads(resp.read().decode())

        access_token = token_resp["access_token"]
        api_version = "v67.0"
        base_url = f"{instance_url}/services/data/{api_version}"

        # ── 2. SOQL: fetch all open opps with CloseDate < today ──
        soql = (
            "SELECT Id, Name, AccountId, Account.Name, Account.Industry, "
            "OwnerId, Owner.Name, StageName, CloseDate, Amount, Probability, "
            "Type_de_vente__c, CreatedDate, IsWon, IsClosed, LeadSource, "
            "CampaignId, Campaign.Name, LastActivityDate, LastModifiedDate, "
            "ExpectedRevenue, HasOpenActivity, LastStageChangeDate "
            "FROM Opportunity WHERE IsClosed = false AND CloseDate < TODAY "
            "ORDER BY CloseDate ASC"
        )

        def soql_query_all(soql_str):
            records = []
            encoded = urllib.parse.quote_plus(soql_str.replace("\n", " ").strip())
            url = f"{base_url}/query?q={encoded}"
            while True:
                req = urllib.request.Request(url, method="GET")
                req.add_header("Authorization", f"Bearer {access_token}")
                with urllib.request.urlopen(req, timeout=60) as resp:
                    payload = json.loads(resp.read().decode())
                records.extend(payload.get("records", []))
                if payload.get("done", True):
                    break
                next_url = payload.get("nextRecordsUrl")
                if not next_url:
                    break
                # nextRecordsUrl is a full URL, use it directly
                url = next_url
            return records

        dechet_records = soql_query_all(soql)

        # Also fetch all open opps for context
        soql_all = (
            "SELECT Id, Name, AccountId, Account.Name, OwnerId, Owner.Name, "
            "StageName, CloseDate, Amount, Probability, Type_de_vente__c, "
            "CreatedDate, LastActivityDate "
            "FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC"
        )
        all_open_records = soql_query_all(soql_all)

        # ── 3. Resolve owners (UserId → Name + IsActive) ──
        owner_ids = list(set(r.get("OwnerId") for r in dechet_records if r.get("OwnerId")))
        users_map = {}
        if owner_ids:
            ids_csv = ",".join(f"'{oid}'" for oid in owner_ids)
            soql_users = f"SELECT Id, Name, IsActive FROM User WHERE Id IN ({ids_csv})"
            user_records = soql_query_all(soql_users)
            users_map = {u["Id"]: {"name": u.get("Name", "?"), "active": u.get("IsActive", False)} for u in user_records}

        # ── 4. Score each opp ──
        today = date.today()
        FORMER_SALESPEOPLE = {"Julien Bak", "Romain Waeselynck", "Roxane Série", "Antoine Fardet", "ibrahima sissoko", "Ibrahima Sissoko"}

        scored = []
        for r in dechet_records:
            opp_id = r.get("Id", "")
            owner_id = r.get("OwnerId", "")
            owner_info = users_map.get(owner_id, {"name": (r.get("Owner") or {}).get("Name", "?"), "active": True})
            owner_name = owner_info["name"]
            owner_active = owner_info["active"]

            close_date_str = r.get("CloseDate", "")
            amount = r.get("Amount")
            probability = r.get("Probability", 0)
            stage = r.get("StageName", "")
            created_str = r.get("CreatedDate", "")
            last_activity_str = r.get("LastActivityDate", "")

            try:
                close_date = datetime.fromisoformat(close_date_str).date() if close_date_str else None
            except Exception:
                close_date = None
            try:
                created_date = datetime.fromisoformat(created_str.replace("Z", "+00:00")).date() if created_str else None
            except Exception:
                created_date = None
            try:
                last_activity = datetime.fromisoformat(last_activity_str).date() if last_activity_str else None
            except Exception:
                last_activity = None

            days_overdue = (today - close_date).days if close_date else 9999
            days_since_activity = (today - last_activity).days if last_activity else 9999
            days_since_creation = (today - created_date).days if created_date else 9999

            score = 0
            reasons = []

            if days_overdue > 0:
                score += min(days_overdue / 30, 12)
                if days_overdue > 365:
                    reasons.append("CloseDate dépassée >1 an")
                elif days_overdue > 180:
                    reasons.append("CloseDate dépassée 6-12 mois")
                elif days_overdue > 90:
                    reasons.append("CloseDate dépassée 3-6 mois")
                else:
                    reasons.append("CloseDate dépassée <3 mois")

            if not last_activity:
                score += 8
                reasons.append("Aucune activité jamais enregistrée")
            elif days_since_activity > 365:
                score += 5
                reasons.append("Pas d'activité depuis >1 an")
            elif days_since_activity > 90:
                score += 5
                reasons.append("Pas d'activité depuis >3 mois")
            elif days_since_activity > 30:
                score += 2
                reasons.append("Pas d'activité depuis >30j")

            if not amount or amount == 0:
                score += 6
                reasons.append("Pas de montant")

            if probability == 0:
                score += 3
                reasons.append("Probabilité = 0%")

            if not owner_active:
                score += 10
                reasons.append("Owner inactif")

            if owner_name in FORMER_SALESPEOPLE:
                score += 8
                reasons.append("Ancien commercial")

            if days_since_creation > 730:
                score += 4
                reasons.append("Créée il y a >2 ans")
            elif days_since_creation > 365:
                score += 2
                reasons.append("Créée il y a >1 an")

            if stage == "Suspect enlisé":
                score += 3
                reasons.append("Stage: Suspect enlisé")

            if amount and amount > 0:
                score += min(amount / 10000, 5)

            sf_link = f"https://db0000000d7rdeay.my.salesforce.com/lightning/r/Opportunity/{opp_id}/view"

            scored.append({
                "id": opp_id,
                "name": r.get("Name", ""),
                "account": (r.get("Account") or {}).get("Name", "—") if isinstance(r.get("Account"), dict) else "—",
                "industry": (r.get("Account") or {}).get("Industry", "—") if isinstance(r.get("Account"), dict) else "—",
                "owner": owner_name,
                "owner_active": owner_active,
                "stage": stage,
                "close_date": close_date_str,
                "days_overdue": days_overdue,
                "amount": amount,
                "probability": probability,
                "type_vente": r.get("Type_de_vente__c", "—"),
                "created_date": created_str[:10] if created_str else "",
                "days_since_creation": days_since_creation,
                "last_activity": last_activity_str or "",
                "days_since_activity": days_since_activity,
                "has_open_activity": r.get("HasOpenActivity", False),
                "expected_revenue": r.get("ExpectedRevenue"),
                "last_stage_change": (r.get("LastStageChangeDate") or "")[:10],
                "score": round(score, 1),
                "reasons": reasons,
                "sf_link": sf_link,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)

        # ── 5. Compute stats ──
        total_dechet = len(scored)
        total_open = len(all_open_records)
        pct_dechet = round(total_dechet / total_open * 100, 1) if total_open else 0
        ca_at_risk = sum(o["amount"] or 0 for o in scored)

        owner_stats = {}
        for o in scored:
            on = o["owner"]
            if on not in owner_stats:
                owner_stats[on] = {"count": 0, "amount": 0, "active": o["owner_active"]}
            owner_stats[on]["count"] += 1
            owner_stats[on]["amount"] += o["amount"] or 0

        stage_stats = {}
        for o in scored:
            stage_stats[o["stage"]] = stage_stats.get(o["stage"], 0) + 1

        overdue_buckets = {"<30j": 0, "31-90j": 0, "91-180j": 0, "181-365j": 0, ">365j": 0}
        for o in scored:
            d = o["days_overdue"]
            if d < 30: overdue_buckets["<30j"] += 1
            elif d <= 90: overdue_buckets["31-90j"] += 1
            elif d <= 180: overdue_buckets["91-180j"] += 1
            elif d <= 365: overdue_buckets["181-365j"] += 1
            else: overdue_buckets[">365j"] += 1

        reason_stats = {}
        for o in scored:
            for reason in o["reasons"]:
                key = reason.split("(")[0].strip().rstrip(":")
                reason_stats[key] = reason_stats.get(key, 0) + 1

        dashboard_data = {
            "generated_at": datetime.now().isoformat(),
            "total_dechet": total_dechet,
            "total_open": total_open,
            "pct_dechet": pct_dechet,
            "ca_at_risk": ca_at_risk,
            "owner_stats": owner_stats,
            "stage_stats": stage_stats,
            "overdue_buckets": overdue_buckets,
            "reason_stats": reason_stats,
            "opps": scored,
        }

        return {
            "statusCode": 200,
            "body": json.dumps(dashboard_data, ensure_ascii=False),
            "headers": {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            }
        }

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else str(e)
        return {
            "statusCode": e.code,
            "body": json.dumps({"error": "salesforce_api_error", "message": body[:500]}),
            "headers": {"Content-Type": "application/json"}
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "internal", "message": str(e)[:500]}),
            "headers": {"Content-Type": "application/json"}
        }