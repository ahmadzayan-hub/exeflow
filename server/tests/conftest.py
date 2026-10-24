import io
from pathlib import Path

import pandas as pd
import pytest

from execflow.ingest import ingest


@pytest.fixture
def xlsx_bytes() -> bytes:
    """A workbook shaped like a maintainer monthly KPI extract, with a title row above the header."""
    rows = [
        ["KPI extract", None, None, None, None],
        ["Month", "System", "Failures", "Delay Minutes", "PM Completion"],
        ["2026-05-01", "Signalling", 12, 340, "98%"],
        ["2026-05-01", "Rolling Stock", 8, 120, "100%"],
        ["2026-06-01", "Signalling", 15, 410, "97%"],
        ["2026-06-01", "Rolling Stock", 6, "1,050", "100%"],
        ["2026-07-01", "Signalling", 9, 200, "100%"],
        ["2026-07-01", "Rolling Stock", 11, 260, "99%"],
    ]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        pd.DataFrame(rows).to_excel(xw, sheet_name="KPI Data", header=False, index=False)
        pd.DataFrame([["Note", "Value"], ["Period", "Q2 2026"]]).to_excel(xw, sheet_name="Cover", header=False, index=False)
    return buf.getvalue()


@pytest.fixture
def dataset(xlsx_bytes):
    return ingest("kpi_extract.xlsx", xlsx_bytes)


@pytest.fixture
def csv_bytes() -> bytes:
    return b"Contract,Owner,Value AED,Due\nDEMO-SIG-101,Dept,96000000,2028-02-12\nDEMO-TEL-204,Dept,19240000,\nDEMO-MNT-310,Dept,,2026-11-30\n"


@pytest.fixture
def tmp_root(tmp_path: Path) -> Path:
    return tmp_path
