import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import type { EventRecord, SpanRecord, TraceRecord } from "@/lib/trace";
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const log = logger.forTag("TraceDumpDetail");

// ─── Types ──────────────────────────────────────────────────────────────────

type DumpPayload = {
  exportedAt: number;
  appVersion: string;
  platform: string;
  dumpReason: string;
  rejectionEvent: unknown;
  records: TraceRecord[];
};

type TimelineEntry = {
  key: string;
  offsetMs: number;
  kind: "span" | "event" | "span-event";
  name: string;
  detail: string;
  isError: boolean;
  isInFlight: boolean;
  depth: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAttrs(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  const entries = Object.entries(attrs);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => {
    const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
    return `${k}=${val}`;
  });
  return `[${parts.join(", ")}]`;
}

function buildTimeline(records: TraceRecord[]): TimelineEntry[] {
  if (records.length === 0) return [];

  let firstTs = Number.POSITIVE_INFINITY;
  for (const r of records) {
    const t = r.type === "event" ? r.timestamp : r.startTime;
    if (t < firstTs) firstTs = t;
  }
  if (!Number.isFinite(firstTs)) firstTs = 0;

  const spans = records.filter((r): r is SpanRecord => r.type === "span");
  const standaloneEvents = records.filter((r): r is EventRecord => r.type === "event");

  // Map spanId → standalone EventRecords that belong to that span
  const spanIds = new Set(spans.map((s) => s.spanId));
  const eventsBySpanId = new Map<string, EventRecord[]>();
  const orphanEvents: EventRecord[] = [];

  for (const ev of standaloneEvents) {
    if (ev.spanId && spanIds.has(ev.spanId)) {
      const arr = eventsBySpanId.get(ev.spanId) ?? [];
      arr.push(ev);
      eventsBySpanId.set(ev.spanId, arr);
    } else {
      orphanEvents.push(ev);
    }
  }

  const entries: TimelineEntry[] = [];
  let idx = 0;

  // Spans sorted by startTime, each followed by their children
  const sortedSpans = [...spans].sort((a, b) => a.startTime - b.startTime);

  for (const span of sortedSpans) {
    const parts: string[] = [];
    if (span.status) parts.push(`status=${span.status}`);
    if (span.durationMs != null) parts.push(`duration=${span.durationMs}ms`);
    const attrsStr = formatAttrs(span.attributes);
    if (attrsStr) parts.push(attrsStr);
    if (span.error) parts.push(`error=${span.error.message}`);

    const isInFlight = span.attributes?._inFlight === true;
    entries.push({
      key: `span-${idx++}`,
      offsetMs: span.startTime - firstTs,
      kind: "span",
      name: span.name,
      detail: parts.join(" "),
      isError: span.status === "error" || !!span.error,
      isInFlight,
      depth: 0,
    });

    // Collect children: inline span events + matching standalone events
    type Child = { offsetMs: number; kind: "span-event" | "event"; name: string; detail: string };
    const children: Child[] = [];

    for (const ev of span.events ?? []) {
      children.push({
        offsetMs: ev.timestamp - firstTs,
        kind: "span-event",
        name: ev.name,
        detail: formatAttrs(ev.attributes),
      });
    }

    for (const ev of eventsBySpanId.get(span.spanId) ?? []) {
      children.push({
        offsetMs: ev.timestamp - firstTs,
        kind: "event",
        name: ev.name,
        detail: formatAttrs(ev.attributes),
      });
    }

    children.sort((a, b) => a.offsetMs - b.offsetMs);

    for (const child of children) {
      entries.push({
        key: `child-${idx++}`,
        offsetMs: child.offsetMs,
        kind: child.kind,
        name: child.name,
        detail: child.detail,
        isError: false,
        isInFlight: false,
        depth: 1,
      });
    }
  }

  // Orphan events (no matching span) in time order
  orphanEvents.sort((a, b) => a.timestamp - b.timestamp);
  for (const ev of orphanEvents) {
    entries.push({
      key: `event-${idx++}`,
      offsetMs: ev.timestamp - firstTs,
      kind: "event",
      name: ev.name,
      detail: formatAttrs(ev.attributes),
      isError: false,
      isInFlight: false,
      depth: 0,
    });
  }

  return entries;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type ActiveView = "timeline" | "raw";

export default function TraceDumpDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { colors } = useThemedStyles();
  const [raw, setRaw] = useState<string>("");
  const [payload, setPayload] = useState<DumpPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ActiveView>("timeline");

  useEffect(() => {
    if (!name) return;
    const resolvedName = Array.isArray(name) ? name[0] : name;
    (async () => {
      try {
        const file = new File(Paths.document, resolvedName);
        const text = await file.text();
        try {
          const parsed = JSON.parse(text) as DumpPayload;
          setPayload(parsed);
          setRaw(JSON.stringify(parsed, null, 2));
        } catch {
          setRaw(text);
        }
      } catch (err) {
        log.error("[TraceDumpDetail] Failed to read file", err as Error);
        setError("Failed to read dump file.");
      }
    })();
  }, [name]);

  const timeline = useMemo(() => (payload ? buildTimeline(payload.records) : []), [payload]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.error }}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Toggle */}
      <View style={[styles.toggle, { borderColor: colors.separator }]}>
        {(["timeline", "raw"] as ActiveView[]).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleTab, view === v && { backgroundColor: colors.link }]}
            onPress={() => setView(v)}
          >
            <Text
              style={[styles.toggleLabel, { color: view === v ? "#fff" : colors.textSecondary }]}
            >
              {v === "timeline" ? "Timeline" : "Raw JSON"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meta row */}
      {payload && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {payload.dumpReason} · {payload.platform} · v{payload.appVersion} ·{" "}
          {payload.records.length} records
        </Text>
      )}

      {/* Content */}
      {view === "timeline" ? (
        <FlatList
          data={timeline}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <TimelineRow item={item} colors={colors} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No records in this dump.
            </Text>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={[styles.rawText, { color: colors.textPrimary }]} selectable>
            {raw}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useThemedStyles>["colors"];

function TimelineRow({ item, colors }: { item: TimelineEntry; colors: Colors }) {
  const nameColor = item.isError
    ? colors.error
    : item.kind === "event" || item.kind === "span-event"
      ? colors.link
      : colors.textPrimary;

  return (
    <View style={[styles.row, item.depth > 0 && styles.rowChild]}>
      <Text style={[styles.offset, { color: colors.textSecondary }]}>{`+${item.offsetMs}ms`}</Text>
      <View style={styles.rowBody}>
        <View style={styles.kindRow}>
          <Text style={[styles.kind, { color: colors.textSecondary }]}>
            {item.kind === "span-event" ? "ev" : item.kind}
          </Text>
          {item.isInFlight && (
            <Text style={[styles.inFlight, { color: "#f59e0b" }]}>{" ●in-flight"}</Text>
          )}
        </View>
        <Text style={[styles.rowName, { color: nameColor }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={3}>
            {item.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  toggle: {
    flexDirection: "row",
    margin: 12,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  toggleTab: { flex: 1, paddingVertical: 8, alignItems: "center" },
  toggleLabel: { fontSize: 13, fontWeight: "600" },
  meta: { fontSize: 11, marginHorizontal: 12, marginBottom: 8 },
  listContent: { paddingHorizontal: 12, paddingBottom: 80 },
  empty: { fontSize: 13, fontStyle: "italic", marginTop: 24, textAlign: "center" },
  rawText: { fontFamily: "monospace", fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", paddingVertical: 4, gap: 6 },
  rowChild: { paddingLeft: 20, opacity: 0.85 },
  offset: { fontSize: 10, fontFamily: "monospace", width: 56, paddingTop: 1, textAlign: "right" },
  rowBody: { flex: 1, gap: 1 },
  kindRow: { flexDirection: "row", alignItems: "center" },
  kind: { fontSize: 10, fontFamily: "monospace", textTransform: "uppercase" },
  inFlight: { fontSize: 10, fontFamily: "monospace" },
  rowName: { fontSize: 12, fontFamily: "monospace", fontWeight: "600" },
  detail: { fontSize: 11, fontFamily: "monospace" },
});
