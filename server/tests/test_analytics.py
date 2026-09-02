import pytest

from execflow.analytics import aggregate, compare, distribution, run_tool, trend


def test_aggregate_grouped(dataset):
    r = aggregate(dataset, "KPI_Data", "Failures", "sum", group_by="System")
    assert {row["System"]: row["sum_Failures"] for row in r["rows"]} == {"Signalling": 36, "Rolling Stock": 25}


def test_aggregate_scalar_with_filter(dataset):
    r = aggregate(dataset, "KPI_Data", "Delay Minutes", "sum", filters=[{"column": "System", "value": "Signalling"}])
    assert r["value"] == 950 and r["filtered_rows"] == 3


def test_trend(dataset):
    r = trend(dataset, "KPI_Data", "Month", "Failures", "sum", "M")
    assert [row["period"] for row in r["rows"]] == ["2026-05", "2026-06", "2026-07"]
    assert [row["sum_Failures"] for row in r["rows"]] == [20, 21, 20]


def test_distribution_and_compare(dataset):
    d = distribution(dataset, "KPI_Data", "System")
    assert d["rows"][0]["count"] == 3 and d["rows"][0]["share"] == 0.5
    c = compare(dataset, "KPI_Data", "Failures", "System", "Signalling", "Rolling Stock")
    assert c["delta"] == -11 and c["delta_pct"] == pytest.approx(-30.56, abs=0.01)


def test_run_tool_evidence_and_guards(dataset):
    r1 = run_tool(dataset, "aggregate", {"table": "KPI_Data", "metric": "Failures"})
    r2 = run_tool(dataset, "aggregate", {"table": "KPI_Data", "metric": "Failures"})
    assert r1["evidence_id"] == r2["evidence_id"] and r1["value"] == 61
    with pytest.raises(PermissionError):
        run_tool(dataset, "sample_rows", {"table": "KPI_Data"})
    assert run_tool(dataset, "sample_rows", {"table": "KPI_Data", "n": 2}, allow_rows=True)["total"] == 6
    with pytest.raises(ValueError):
        run_tool(dataset, "aggregate", {"table": "KPI_Data", "metric": "Nope"})
