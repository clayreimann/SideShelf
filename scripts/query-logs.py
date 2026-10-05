#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb>=1.0"]
# ///
"""Query SideShelf log files and trace dumps using SQL.

All *.txt log files and trace-dump-*.json files in the logs/ directory
are loaded into three queryable tables:

  logs          (ts, level, tag, subtag, message, source_file)
  spans         (trace_id, span_id, name, start_time, end_time,
                 duration_ms, in_flight, attributes, source_file)
  trace_events  (ts, name, trace_id, span_id, attributes, source_file)

Usage:
  uv run scripts/query-logs.py --schema
  uv run scripts/query-logs.py --list
  uv run scripts/query-logs.py "SELECT level, count(*) FROM logs GROUP BY level"
  uv run scripts/query-logs.py --dir /path/to/logs "SELECT * FROM logs WHERE level='ERROR'"
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import duckdb

LOG_PATTERN = re.compile(
    r'^\[(?P<timestamp>[^\]]+)\]\s+\[(?P<level>[^\]]+)\]\s+\[(?P<tag>[^\]]+)\]'
    r'(?:\s+\[(?P<subtag>[^\]]+)\])?\s+(?P<message>.+)$'
)

SCHEMA_TEXT = """\
TABLE: logs
  ts           TIMESTAMP  — log timestamp (UTC)
  level        VARCHAR      — DEBUG | INFO | WARN | ERROR
  tag          VARCHAR      — component tag (e.g. PlayerService)
  subtag       VARCHAR      — optional sub-tag (e.g. Coordinator), nullable
  message      VARCHAR      — log message
  source_file  VARCHAR      — originating filename

TABLE: spans
  trace_id     VARCHAR      — trace identifier
  span_id      VARCHAR      — span identifier
  name         VARCHAR      — operation name (e.g. player.session.sync)
  start_time   TIMESTAMP  — span start (UTC)
  end_time     TIMESTAMP  — span end (NULL if in-flight)
  duration_ms  DOUBLE       — duration in ms (NULL if in-flight)
  in_flight    BOOLEAN      — true if span was captured mid-flight
  attributes   VARCHAR      — JSON object of remaining span attributes
  source_file  VARCHAR      — originating filename

TABLE: trace_events
  ts           TIMESTAMP  — event timestamp (UTC)
  name         VARCHAR      — event name (e.g. session.sync.started)
  trace_id     VARCHAR      — trace identifier
  span_id      VARCHAR      — parent span identifier
  attributes   VARCHAR      — JSON object of event attributes
  source_file  VARCHAR      — originating filename
"""


def parse_log_file(path: Path) -> list[tuple]:
    """Parse a .txt log file into a list of row tuples for the logs table."""
    rows = []
    source_file = path.name
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = LOG_PATTERN.match(line.rstrip("\n"))
            if not m:
                continue
            try:
                ts = datetime.fromisoformat(
                    m.group("timestamp").replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except ValueError:
                continue
            rows.append((
                ts,
                m.group("level"),
                m.group("tag"),
                m.group("subtag"),  # None when absent
                m.group("message"),
                source_file,
            ))
    return rows


def parse_trace_file(path: Path) -> tuple[list[tuple], list[tuple]]:
    """Parse a trace-dump JSON file into (span_rows, event_rows)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    source_file = path.name
    spans: list[tuple] = []
    events: list[tuple] = []

    for record in data.get("records", []):
        rtype = record.get("type")

        if rtype == "span":
            attrs = dict(record.get("attributes", {}))
            in_flight = bool(attrs.pop("_inFlight", False))
            start_ms = record.get("startTime")
            end_ms = record.get("endTime")
            start_time = (
                datetime.utcfromtimestamp(start_ms / 1000)
                if start_ms is not None else None
            )
            end_time = (
                datetime.utcfromtimestamp(end_ms / 1000)
                if end_ms is not None else None
            )
            duration_ms = (
                float(end_ms - start_ms)
                if (start_ms is not None and end_ms is not None) else None
            )
            spans.append((
                record.get("traceId"),
                record.get("spanId"),
                record.get("name"),
                start_time,
                end_time,
                duration_ms,
                in_flight,
                json.dumps(attrs),
                source_file,
            ))

        elif rtype == "event":
            ts_ms = record.get("timestamp")
            ts = (
                datetime.utcfromtimestamp(ts_ms / 1000)
                if ts_ms is not None else None
            )
            attrs = record.get("attributes", {})
            events.append((
                ts,
                record.get("name"),
                record.get("traceId"),
                record.get("spanId"),
                json.dumps(attrs),
                source_file,
            ))

    return spans, events


def build_db(logs_dir: Path) -> tuple[duckdb.DuckDBPyConnection, dict]:
    """Load all files in logs_dir and return (connection, stats)."""
    con = duckdb.connect()

    con.execute("""
        CREATE TABLE logs (
            ts TIMESTAMP, level VARCHAR, tag VARCHAR, subtag VARCHAR,
            message VARCHAR, source_file VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE spans (
            trace_id VARCHAR, span_id VARCHAR, name VARCHAR,
            start_time TIMESTAMP, end_time TIMESTAMP, duration_ms DOUBLE,
            in_flight BOOLEAN, attributes VARCHAR, source_file VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE trace_events (
            ts TIMESTAMP, name VARCHAR, trace_id VARCHAR,
            span_id VARCHAR, attributes VARCHAR, source_file VARCHAR
        )
    """)

    stats = {
        "log_files": 0, "trace_files": 0,
        "log_rows": 0, "span_rows": 0, "event_rows": 0,
    }

    for txt_file in sorted(logs_dir.glob("*.txt")):
        rows = parse_log_file(txt_file)
        if rows:
            con.executemany("INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?)", rows)
        stats["log_files"] += 1
        stats["log_rows"] += len(rows)

    for json_file in sorted(logs_dir.glob("trace-dump-*.json")):
        span_rows, event_rows = parse_trace_file(json_file)
        if span_rows:
            con.executemany("INSERT INTO spans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", span_rows)
        if event_rows:
            con.executemany("INSERT INTO trace_events VALUES (?, ?, ?, ?, ?, ?)", event_rows)
        stats["trace_files"] += 1
        stats["span_rows"] += len(span_rows)
        stats["event_rows"] += len(event_rows)

    return con, stats


def print_table(description: list, rows: list[tuple]) -> None:
    """Print query results as a formatted ASCII table."""
    if not rows:
        print("(0 rows)")
        return

    cols = [d[0] for d in description]
    str_rows = [tuple("NULL" if v is None else str(v) for v in row) for row in rows]
    widths = [
        max(len(cols[i]), max(len(r[i]) for r in str_rows))
        for i in range(len(cols))
    ]

    sep = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    header = "| " + " | ".join(cols[i].ljust(widths[i]) for i in range(len(cols))) + " |"

    print(sep)
    print(header)
    print(sep)
    for row in str_rows:
        print("| " + " | ".join(row[i].ljust(widths[i]) for i in range(len(row))) + " |")
    print(sep)
    n = len(rows)
    print(f"({n} row{'s' if n != 1 else ''})")


def cmd_list(logs_dir: Path) -> None:
    """Print all log/trace files in the directory with sizes."""
    txt_files = sorted(logs_dir.glob("*.txt"))
    json_files = sorted(logs_dir.glob("trace-dump-*.json"))

    if not txt_files and not json_files:
        print(f"No log files found in {logs_dir}", file=sys.stderr)
        return

    all_files = [("log", f) for f in txt_files] + [("trace", f) for f in json_files]
    name_width = max(len(f.name) for _, f in all_files)

    print(f"\nFiles in {logs_dir.resolve()}:\n")
    for ftype, f in all_files:
        size_kb = f.stat().st_size / 1024
        print(f"  [{ftype:5s}]  {f.name.ljust(name_width)}  {size_kb:>8.1f} KB")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Query SideShelf log files and trace dumps using SQL.",
        epilog="Tables: logs, spans, trace_events — each with a source_file column.",
    )
    parser.add_argument("query", nargs="?", help="SQL query to execute")
    parser.add_argument(
        "--dir", default="logs",
        help="Directory containing log files (default: logs/)",
    )
    parser.add_argument(
        "--schema", action="store_true",
        help="Show table schemas and exit",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List available files and exit (no SQL needed)",
    )
    args = parser.parse_args()

    logs_dir = Path(args.dir)
    if not logs_dir.exists():
        print(f"Error: directory '{logs_dir}' not found", file=sys.stderr)
        sys.exit(1)

    if args.schema:
        print(SCHEMA_TEXT)
        return

    if args.list:
        cmd_list(logs_dir)
        return

    if not args.query:
        parser.print_help()
        return

    con, stats = build_db(logs_dir)
    print(
        f"Loaded {stats['log_files']} log file(s) ({stats['log_rows']:,} rows), "
        f"{stats['trace_files']} trace file(s) "
        f"({stats['span_rows']} spans, {stats['event_rows']} events)",
        file=sys.stderr,
    )

    try:
        result = con.execute(args.query)
        rows = result.fetchall()
        print_table(result.description, rows)
    except duckdb.Error as e:
        print(f"SQL error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
