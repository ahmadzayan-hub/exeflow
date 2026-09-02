from execflow.agents import evidence_gate, run_analysis
from execflow.llm import MockClient, load_routing
from execflow.memory import Memory


def test_gate_rejects_numbers_not_in_evidence():
    ev = {"e1": {"id": "e1", "tool": "aggregate", "args": {}, "result": {"value": 950, "metric": "Delay Minutes", "filtered_rows": 3}}}
    assert evidence_gate({"title": "Delay minutes total 950", "detail": "", "evidence": ["e1"]}, ev)[0]
    assert not evidence_gate({"title": "Delay minutes total 960", "detail": "", "evidence": ["e1"]}, ev)[0]
    assert not evidence_gate({"title": "x", "detail": "", "evidence": ["missing"]}, ev)[0]


def test_gate_accepts_derived_percentages():
    ev = {"e1": {"id": "e1", "tool": "trend", "args": {}, "result": {"rows": [{"period": "2026-05", "sum_f": 20}, {"period": "2026-06", "sum_f": 21}]}}}
    ok, why = evidence_gate({"title": "Failures rose 5% between 2026-05 and 2026-06", "detail": "from 20 to 21", "evidence": ["e1"]}, ev)
    assert ok, why


def test_end_to_end_with_mock(dataset):
    routing = load_routing({"EXECFLOW_PROVIDER": "mock"})
    mem = Memory()
    mem.remember("definition", "Failures means service affecting failures logged by the maintainer")
    res = run_analysis(dataset, mem, routing, "Which system drives failures?", "en")
    assert res.models["analyst"] == "mock:mock"
    assert any("mock provider" in w for w in res.warnings)
    titles = [f["title"] for f in res.findings]
    assert any("Signalling has the highest Failures" in t for t in titles)
    assert any("Fabricated" in r["title"] and r["reason"].startswith("gate") for r in res.rejected)
    assert res.charts and {c["type"] for c in res.charts} == {"bar", "line"}
    assert res.charts[0]["series"][0]["points"][0]["y"] == 36
    assert res.report_md.startswith("# Executive summary")
    assert res.memory_used and res.memory_used[0]["kind"] == "definition"
    assert mem.get_run(res.run_id)["status"] == "done"
    assert len(res.memory_written) == len(res.findings)
    ar = run_analysis(dataset, mem, routing, None, "ar", clients={"analyst": MockClient("analyst"), "reviewer": MockClient("reviewer"), "reporter": MockClient("reporter")})
    assert ar.report_md.startswith("# الملخص التنفيذي")
