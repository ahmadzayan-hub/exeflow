from execflow.memory import Memory


def test_remember_recall_forget():
    m = Memory()
    a = m.remember("definition", "TSA (Train Service Availability) target is 99% with a 94% cap, per RTA-LETTER-005426")
    m.remember("finding", "Signalling failures rose from 12 to 15 between May and June 2026", source="run-1")
    hits = m.recall("signalling failures june")
    assert hits and hits[0]["kind"] == "finding"
    assert m.recall("TSA availability")[0]["id"] == a["id"]
    assert m.forget(a["id"])
    assert all(h["id"] != a["id"] for h in m.recall("TSA availability"))


def test_runs_and_export():
    m = Memory()
    rid = m.start_run("ds1", "Why did failures rise?", "en")
    m.finish_run(rid, "done", {"findings": [{"text": "x"}]})
    run = m.get_run(rid)
    assert run["status"] == "done" and run["result"]["findings"][0]["text"] == "x"
    assert m.list_runs("ds1")[0]["id"] == rid
    m.remember("preference", "Reports in English with Arabic executive summary")
    md = m.export_markdown()
    assert "## Preferences" in md and "Arabic executive summary" in md
