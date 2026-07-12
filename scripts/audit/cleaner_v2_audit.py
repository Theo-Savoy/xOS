#!/usr/bin/env python3
"""Read-only volume audit for Labo Cleaner v2 (lot 10.0).

The script reuses the local Hermes Salesforce session convention used by the
other audit scripts. It has no third-party Python dependency and never writes
to Salesforce, Vercel Blob, Supabase, or the local filesystem.

Usage:
    python3 scripts/audit/cleaner_v2_audit.py
    python3 scripts/audit/cleaner_v2_audit.py --execute

Without ``--execute`` it prints the query plan and exits without opening a
Salesforce connection. ``--execute`` performs GET-only SOQL/describe requests
and prints anonymous aggregate volumes as JSON to stdout.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Callable
from urllib.parse import quote_plus, urlparse

API_VERSION_RE = re.compile(r"v\d+\.\d+/")
MAX_OWNER_IDS_PER_QUERY = 200


class AuditBlocked(RuntimeError):
    """The local read-only audit cannot authenticate safely."""


def normalize_salesforce_path(path: str) -> str:
    """Return the relative Salesforce REST path accepted by Hermes.

    Salesforce may return ``nextRecordsUrl`` as a relative path or as a full
    URL. Normalising it here preserves pagination without accepting a write
    endpoint or a different host.
    """

    value = str(path)
    if value.startswith(("http://", "https://")):
        value = urlparse(value).path
    value = value.lstrip("/")
    if "services/data/" in value:
        match = API_VERSION_RE.search(value)
        if match:
            value = value[match.end() :]
    if not (value == "query" or value.startswith("query?") or value.startswith("sobjects/")):
        raise AuditBlocked(f"Unexpected Salesforce read path refused: {value!r}")
    return value


def load_hermes_requester() -> Callable[[str], dict[str, Any]]:
    """Load the established local Hermes OAuth session lazily.

    Importing is delayed so ``python3 -m py_compile`` and the no-execute plan
    work with the standard library alone. Hermes owns its credentials outside
    this repository; no token or environment value is read or printed here.
    """

    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes/hermes-agent"))
    if hermes_home not in sys.path:
        sys.path.insert(0, hermes_home)
    try:
        from hermes_cli.salesforce_api import ensure_salesforce_state, _authorized_request_json
    except Exception as exc:  # pragma: no cover - depends on local Hermes install
        raise AuditBlocked(
            "Hermes Salesforce helper unavailable. Install/enable the local Hermes session "
            "or set HERMES_HOME to its directory."
        ) from exc

    try:
        state = ensure_salesforce_state()
    except Exception as exc:  # pragma: no cover - depends on local credentials
        raise AuditBlocked(
            "Salesforce credentials/session unavailable in Hermes; no audit query was sent."
        ) from exc

    def fetch(path: str) -> dict[str, Any]:
        normalized = normalize_salesforce_path(path)
        try:
            payload = _authorized_request_json(
                state,
                normalized,
                method="GET",
                timeout_seconds=60,
            )
        except Exception as exc:  # pragma: no cover - network/service dependent
            raise AuditBlocked(f"Salesforce read failed for {normalized.split('?')[0]!r}: {exc}") from exc
        if not isinstance(payload, dict):
            raise AuditBlocked("Salesforce returned a non-object response to a read-only audit query.")
        return payload

    return fetch


def query_all(fetch: Callable[[str], dict[str, Any]], soql: str) -> list[dict[str, Any]]:
    """Fetch all SOQL pages through GET requests only."""

    path = "query?q=" + quote_plus(" ".join(soql.split()))
    records: list[dict[str, Any]] = []
    while True:
        payload = fetch(path)
        page_records = payload.get("records") or []
        if not isinstance(page_records, list):
            raise AuditBlocked("Salesforce query page contains an invalid records payload.")
        records.extend(record for record in page_records if isinstance(record, dict))
        if payload.get("done", True):
            return records
        next_records_url = payload.get("nextRecordsUrl")
        if not next_records_url:
            raise AuditBlocked("Salesforce returned an unfinished page without nextRecordsUrl.")
        path = str(next_records_url)


def count_query(fetch: Callable[[str], dict[str, Any]], soql: str) -> int:
    records = query_all(fetch, soql)
    if not records:
        return 0
    value = records[0].get("expr0", records[0].get("count"))
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise AuditBlocked("Salesforce COUNT() response has no numeric aggregate.") from exc


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def quoted_ids(values: list[str]) -> str:
    """Quote Salesforce identifiers queried from Salesforce itself."""

    return ",".join("'" + value.replace("'", "\\'") + "'" for value in values)


def active_picklist_count(describe: dict[str, Any], field_name: str) -> int:
    fields = describe.get("fields") or []
    field = next((item for item in fields if item.get("name") == field_name), {})
    return sum(1 for item in field.get("picklistValues") or [] if item.get("active"))


def build_plan() -> dict[str, Any]:
    return {
        "audit": "lot-10.0-cleaner-v2",
        "mode": "read-only",
        "writes": "none",
        "queries": [
            "COUNT() open opportunities",
            "candidate opportunity pages: overdue open + implausible amount open",
            "candidate owner pages for IsActive only",
            "active OpportunityStage metadata",
            "Opportunity describe for active sale-type and loss-reason picklists",
        ],
        "pagination": "all SOQL query pages are followed through nextRecordsUrl; owner IDs are chunked at 200.",
        "semiJoinReview": "no SOQL semi-join is used, avoiding Salesforce semi-join limits.",
        "payloadReview": "candidate query requests only Id, OwnerId and StageName; describe output is reduced to active-value counts.",
    }


def execute_audit(fetch: Callable[[str], dict[str, Any]]) -> dict[str, Any]:
    overdue_where = "IsClosed = false AND CloseDate < TODAY"
    implausible_where = "IsClosed = false AND Amount > 0 AND Amount <= 100 AND CloseDate >= TODAY"
    candidate_fields = "Id, OwnerId, StageName"

    open_count = count_query(fetch, "SELECT COUNT() FROM Opportunity WHERE IsClosed = false")
    overdue_count = count_query(fetch, f"SELECT COUNT() FROM Opportunity WHERE {overdue_where}")
    implausible_count = count_query(fetch, f"SELECT COUNT() FROM Opportunity WHERE {implausible_where}")

    overdue_candidates = query_all(
        fetch,
        f"SELECT {candidate_fields} FROM Opportunity WHERE {overdue_where} ORDER BY CloseDate ASC",
    )
    implausible_candidates = query_all(
        fetch,
        f"SELECT {candidate_fields} FROM Opportunity WHERE {implausible_where} ORDER BY Amount ASC",
    )
    candidates = overdue_candidates + implausible_candidates
    owner_ids = sorted({str(record["OwnerId"]) for record in candidates if record.get("OwnerId")})

    inactive_owner_ids: set[str] = set()
    for owner_batch in chunks(owner_ids, MAX_OWNER_IDS_PER_QUERY):
        users = query_all(
            fetch,
            "SELECT Id, IsActive FROM User WHERE Id IN (" + quoted_ids(owner_batch) + ")",
        )
        inactive_owner_ids.update(
            str(user["Id"]) for user in users if user.get("Id") and user.get("IsActive") is False
        )

    candidate_stage_counts: dict[str, int] = {}
    for candidate in candidates:
        stage = str(candidate.get("StageName") or "(empty)")
        candidate_stage_counts[stage] = candidate_stage_counts.get(stage, 0) + 1

    stages = query_all(
        fetch,
        "SELECT MasterLabel, IsClosed, IsWon, SortOrder FROM OpportunityStage "
        "WHERE IsActive = true ORDER BY SortOrder",
    )
    describe = fetch("sobjects/Opportunity/describe")

    return {
        "audit": "lot-10.0-cleaner-v2",
        "mode": "read-only",
        "writes": "none",
        "volumes": {
            "openOpportunities": open_count,
            "returnedAnomalyCandidates": {
                "overdueOpen": overdue_count,
                "implausibleAmountOpen": implausible_count,
                "total": len(candidates),
            },
            "inactiveOwnersAmongCandidates": len(inactive_owner_ids),
            "activeStages": len(stages),
            "candidateStageCounts": candidate_stage_counts,
            "picklistMetadata": {
                "activeSaleTypes": active_picklist_count(describe, "Type_de_vente__c"),
                "activeLossReasons": active_picklist_count(describe, "Raison_de_perte_V2__c"),
                "lossReasonController": next(
                    (
                        field.get("controllerName")
                        for field in describe.get("fields") or []
                        if field.get("name") == "Raison_de_perte_V2__c"
                    ),
                    None,
                ),
            },
        },
        "review": build_plan(),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="run read-only Salesforce GET queries; without it, print the query plan only",
    )
    args = parser.parse_args(argv)

    if not args.execute:
        print(json.dumps({**build_plan(), "execution": "blocked_pending_explicit_approval_and_credentials"}, indent=2))
        return 0

    try:
        report = execute_audit(load_hermes_requester())
    except AuditBlocked as exc:
        print(json.dumps({"audit": "lot-10.0-cleaner-v2", "execution": "blocked", "reason": str(exc)}, indent=2))
        return 2

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
