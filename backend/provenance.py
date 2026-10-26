"""Expose completed upstream checks only when bound to the current snapshot."""

import json

from backend.domain import ROOT


def verification_summary(report: dict, files: dict) -> dict:
    summary = {"status": report.get("status", "not_verified"), "checked_at": report.get("checked_at")}
    if summary["status"] != "match":
        return summary
    current_hashes = {name: info["sha256"] for name, info in files.items()}
    if report.get("snapshot_files") != current_hashes:
        return {**summary, "status": "outdated"}
    datasets = report.get("datasets", {})
    if set(datasets) != {"WINDFOR", "FUELHH"} or report.get("requests_checked") != 64:
        return {**summary, "status": "not_verified"}
    for dataset, filename in (("WINDFOR", "forecasts.json.gz"), ("FUELHH", "actuals.json.gz")):
        result = datasets[dataset]
        count = files[filename]["rows"]
        if not all(result.get(field) == count for field in ("bundled_records", "upstream_records", "matched_records")):
            return {**summary, "status": "not_verified"}
        if any(result.get(field) != 0 for field in ("missing_upstream_records", "new_upstream_records", "changed_records")):
            return {**summary, "status": "not_verified"}
    return {**summary, "requests_checked": 64, "matched_records": sum(item["matched_records"] for item in datasets.values())}


def read_verification(files: dict) -> dict:
    try:
        report = json.loads((ROOT / "data/upstream-verification.json").read_text(encoding="utf-8"))
        return verification_summary(report, files)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return {"status": "not_verified", "checked_at": None}
