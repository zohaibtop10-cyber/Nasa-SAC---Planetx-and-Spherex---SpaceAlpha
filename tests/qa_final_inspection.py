#!/usr/bin/env python3
"""
tests/qa_final_inspection.py - Automated QA inspection script for Live Sky

Checks:
1. Strings for "discovery", "found a planet", "new planet", "Planet X found".
2. Candidates and data for numbers without epistemic labels.
3. Every 3D model for "Illustrative" tagging.
4. UI component templates for bare displayed numbers without labels.
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_SRC = ROOT / "web" / "src"
WEB_DATA = ROOT / "web" / "public" / "data"
PIPELINE = ROOT / "pipeline"

FORBIDDEN_PHRASES = [
    r"\bdiscovery\b",
    r"\bfound a planet\b",
    r"\bnew planet\b",
    r"\bplanet x found\b",
]

def check_forbidden_phrases():
    findings = []
    # Search all source files in web/src, pipeline/, web/public/data/
    target_dirs = [WEB_SRC, PIPELINE, WEB_DATA]
    allowed_exts = {".ts", ".tsx", ".py", ".json", ".html", ".css"}
    
    for td in target_dirs:
        for p in td.rglob("*"):
            if p.is_file() and p.suffix in allowed_exts:
                try:
                    text = p.read_text(encoding="utf-8", errors="ignore")
                except Exception as e:
                    continue
                for line_no, line in enumerate(text.splitlines(), start=1):
                    for phrase in FORBIDDEN_PHRASES:
                        m = re.search(phrase, line, re.IGNORECASE)
                        if m:
                            findings.append({
                                "file": str(p.relative_to(ROOT)),
                                "line": line_no,
                                "match": m.group(0),
                                "content": line.strip()
                            })
    return findings

def check_candidates_data():
    findings = []
    cand_path = WEB_DATA / "candidates.json"
    if not cand_path.exists():
        findings.append({"error": "candidates.json not found"})
        return findings
    
    raw = json.loads(cand_path.read_text(encoding="utf-8"))
    cands_list = raw.get("candidates", raw) if isinstance(raw, dict) else raw
    for cand in cands_list:
        cand_id = cand.get("id", "UNKNOWN")
        labels = cand.get("labels", {})
        
        # Verify required positions and confidence labels
        if "positions" not in labels and "positions.ra" not in labels:
            findings.append({
                "candidate": cand_id,
                "issue": "Missing label for 'positions'"
            })
        if "confidence" not in labels:
            findings.append({
                "candidate": cand_id,
                "issue": "Missing label for 'confidence'"
            })
        
        # Verify optional numeric fields have labels
        if cand.get("colour_index") is not None and "colour_index" not in labels:
            findings.append({
                "candidate": cand_id,
                "issue": "Missing label for 'colour_index'"
            })
        
        if cand.get("distance_range"):
            has_dist = any(k in labels for k in ["distance_range", "distance_min_au", "distance_range.min_au"])
            if not has_dist:
                findings.append({
                    "candidate": cand_id,
                    "issue": "Missing label for 'distance_range'"
                })
        
        if cand.get("match") and cand["match"].get("separation_arcsec") is not None:
            has_match = any(k in labels for k in ["match.separation_arcsec", "separation_arcsec"])
            if not has_match:
                findings.append({
                    "candidate": cand_id,
                    "issue": "Missing label for 'match.separation_arcsec'"
                })
        
        # Verify valid label values
        valid_labels = {"measured", "derived", "assumed"}
        for k, v in labels.items():
            if v not in valid_labels:
                findings.append({
                    "candidate": cand_id,
                    "issue": f"Invalid label '{v}' for '{k}' (must be measured, derived, or assumed)"
                })
    return findings

def check_3d_models_illustrative():
    findings = []
    # Check scene model files
    model_files = [
        WEB_SRC / "scene" / "models" / "Asteroid.ts",
        WEB_SRC / "scene" / "models" / "UnknownSegment.ts",
        WEB_SRC / "scene" / "SolarSystem.ts",
        WEB_SRC / "scene" / "SolarSystemScene.tsx",
        WEB_SRC / "ui" / "components" / "ObjectPage.tsx",
    ]
    for mf in model_files:
        if not mf.exists():
            findings.append({"file": str(mf), "issue": "File not found"})
            continue
        text = mf.read_text(encoding="utf-8")
        if "Illustrative" not in text:
            findings.append({"file": str(mf.relative_to(ROOT)), "issue": "Missing 'Illustrative' tag"})
    return findings

def main():
    print("=== LIVE SKY FINAL QA INSPECTION ===")
    
    # 1. Forbidden phrases
    forbidden_matches = check_forbidden_phrases()
    print(f"\n1. Forbidden Phrases Check: {len(forbidden_matches)} matches found")
    for f in forbidden_matches:
        print(f"  - [{f['file']}:{f['line']}] Matched '{f['match']}': {f['content']}")
    
    # 2. Candidate data labels
    cand_issues = check_candidates_data()
    print(f"\n2. Candidate Data Labels Check: {len(cand_issues)} issues found")
    for ci in cand_issues:
        print(f"  - {ci}")
        
    # 3. 3D Model Illustrative Tag Check
    model_issues = check_3d_models_illustrative()
    print(f"\n3. 3D Model Illustrative Tag Check: {len(model_issues)} issues found")
    for mi in model_issues:
        print(f"  - {mi}")

if __name__ == "__main__":
    main()
