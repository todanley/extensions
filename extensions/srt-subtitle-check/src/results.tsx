import { writeFile } from "node:fs/promises";
import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  Keyboard,
  List,
  Toast,
  confirmAlert,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useMemo, useState } from "react";
import { type Preferences, capsFromPreferences } from "./caps";
import { parseSRT } from "./engine";
import { type Caps, fixSrtTool, lintSrtTool, srtStatsTool } from "./tools";

export interface ReportSource {
  label: string;
  text: string;
  filePath?: string;
}

type LintIssue = ReturnType<typeof lintSrtTool>["issues"][number];

function issueIcon(issue: LintIssue): { source: Icon; tintColor: Color } {
  const tintColor = issue.severity === "error" ? Color.Red : Color.Orange;
  switch (issue.code) {
    case "overlap":
      return { source: Icon.ExclamationMark, tintColor };
    case "endBeforeStart":
      return { source: Icon.ArrowClockwise, tintColor };
    case "cps":
      return { source: Icon.Gauge, tintColor };
    case "longLine":
      return { source: Icon.Text, tintColor };
    case "badNumber":
    case "missingNumber":
      return { source: Icon.Hashtag, tintColor };
    case "tsFormat":
    case "badTime":
    case "missingTime":
      return { source: Icon.Clock, tintColor };
    case "empty":
      return { source: Icon.Minus, tintColor };
    default:
      return { source: Icon.Warning, tintColor };
  }
}

function cueMarkdown(text: string, cueNumber?: number | null): string {
  if (cueNumber == null) {
    return "This issue is not tied to a single cue.";
  }
  const cue = parseSRT(text).cues[cueNumber - 1];
  if (!cue) {
    return `Cue ${cueNumber} was not found.`;
  }
  const timing = cue.ts.normalized || cue.ts.raw || "Missing timing";
  const body = cue.text?.trim() ? cue.text : "_(empty cue)_";
  return `## Cue ${cueNumber}\n\n\`${timing}\`\n\n${body}`;
}

function issueTitle(issue: LintIssue): string {
  const cue = issue.cue != null ? `Cue ${issue.cue}` : "File";
  return `${cue}: ${issue.message}`;
}

function cpsAccessory(issue: LintIssue): List.Item.Accessory[] {
  const cps = issue.params && typeof issue.params.cps === "number" ? issue.params.cps : undefined;
  return cps != null ? [{ text: `${cps} CPS` }] : [];
}

function summaryIcon(errors: number, warnings: number) {
  if (errors > 0) {
    return { source: Icon.XMarkCircle, tintColor: Color.Red };
  }
  if (warnings > 0) {
    return { source: Icon.Warning, tintColor: Color.Orange };
  }
  return { source: Icon.CheckCircle, tintColor: Color.Green };
}

function summaryColor(errors: number, warnings: number): Color {
  if (errors > 0) {
    return Color.Red;
  }
  if (warnings > 0) {
    return Color.Orange;
  }
  return Color.Green;
}

async function copyFixed(text: string, caps: Caps) {
  const fixed = fixSrtTool(text, undefined, caps);
  const edits = fixed.applied.reduce((sum, item) => sum + item.edits, 0);
  await Clipboard.copy(fixed.srt);
  await showToast({
    style: Toast.Style.Success,
    title: "Copied fixed subtitles",
    message: `${edits} edits · ${fixed.remainingIssues} issues remain`,
  });
}

async function applyFixedToFile(filePath: string, text: string, caps: Caps) {
  const confirmed = await confirmAlert({
    title: "Apply Safe Fixes to File?",
    message: `Overwrite ${filePath} with renumbered cues, normalized timestamps, and wrapped long lines. Overlaps and negative durations are left as-is.`,
    primaryAction: { title: "Write File" },
  });
  if (!confirmed) {
    return;
  }
  const fixed = fixSrtTool(text, undefined, caps);
  await writeFile(filePath, fixed.srt, "utf8");
  await showToast({
    style: Toast.Style.Success,
    title: "Wrote safe fixes",
    message: `${fixed.remainingIssues} issues remain in ${filePath}`,
  });
}

function ReportActions(props: { source: ReportSource; caps: Caps; onToggleDetail?: () => void }) {
  const { source, caps, onToggleDetail } = props;
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action
          title="Copy Fixed Subtitles"
          icon={Icon.Clipboard}
          shortcut={Keyboard.Shortcut.Common.Copy}
          onAction={() => copyFixed(source.text, caps)}
        />
        {source.filePath ? (
          <Action
            title="Apply Safe Fixes to File"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Save}
            onAction={() => applyFixedToFile(source.filePath!, source.text, caps)}
          />
        ) : null}
        <Action.CopyToClipboard title="Copy Original Subtitles" icon={Icon.Document} content={source.text} />
        {onToggleDetail ? (
          <Action
            title="Toggle Detail"
            icon={Icon.AppWindowSidebarLeft}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
            onAction={onToggleDetail}
          />
        ) : null}
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function IssueItem(props: {
  issue: LintIssue;
  index: number;
  kind: "error" | "warn";
  source: ReportSource;
  caps: Caps;
  onToggleDetail: () => void;
}) {
  const { issue, index, kind, source, caps, onToggleDetail } = props;
  return (
    <List.Item
      key={`${kind}-${index}-${issue.code}-${issue.cue ?? "file"}`}
      title={issueTitle(issue)}
      subtitle={issue.code}
      icon={issueIcon(issue)}
      accessories={cpsAccessory(issue)}
      detail={<List.Item.Detail markdown={`${issue.message}\n\n${cueMarkdown(source.text, issue.cue)}`} />}
      actions={<ReportActions source={source} caps={caps} onToggleDetail={onToggleDetail} />}
    />
  );
}

export function ReportList(props: { source: ReportSource }) {
  const { source } = props;
  const [showingDetail, setShowingDetail] = useState(true);
  const caps = useMemo(() => capsFromPreferences(getPreferenceValues<Preferences>()), []);
  const lint = useMemo(() => lintSrtTool(source.text, caps), [source.text, caps]);
  const stats = useMemo(() => srtStatsTool(source.text, caps), [source.text, caps]);
  const errors = lint.issues.filter((issue) => issue.severity === "error");
  const warnings = lint.issues.filter((issue) => issue.severity === "warn");
  const toggleDetail = () => setShowingDetail((value) => !value);

  const summaryTitle =
    lint.stats.issues === 0
      ? "No issues found"
      : `${lint.stats.errors} error${lint.stats.errors === 1 ? "" : "s"}, ${lint.stats.warnings} warning${
          lint.stats.warnings === 1 ? "" : "s"
        }`;

  return (
    <List
      isShowingDetail={showingDetail}
      searchBarPlaceholder="Filter issues and cues…"
      navigationTitle="SRT Subtitle Check"
    >
      <List.Section title="Summary" subtitle={source.label}>
        <List.Item
          title={summaryTitle}
          subtitle={`${lint.cues} cue${lint.cues === 1 ? "" : "s"} · avg ${stats.avgCps ?? "—"} CPS · max ${stats.maxCps ?? "—"} CPS`}
          icon={summaryIcon(lint.stats.errors, lint.stats.warnings)}
          accessories={[
            { text: source.filePath ? source.filePath : "Clipboard" },
            {
              tag: {
                value: `${lint.stats.issues}`,
                color: summaryColor(lint.stats.errors, lint.stats.warnings),
              },
            },
          ]}
          detail={
            <List.Item.Detail
              markdown={`**${source.label}**\n\n- Cues: ${lint.cues}\n- Errors: ${lint.stats.errors}\n- Warnings: ${lint.stats.warnings}\n- Average CPS: ${stats.avgCps ?? "—"}\n- Max CPS: ${stats.maxCps ?? "—"}\n- Duration: ${
                stats.totalDurationMs != null ? `${(stats.totalDurationMs / 1000).toFixed(2)}s` : "—"
              }`}
            />
          }
          actions={<ReportActions source={source} caps={caps} onToggleDetail={toggleDetail} />}
        />
      </List.Section>

      <List.Section title="Errors" subtitle={`${errors.length}`}>
        {errors.map((issue, index) => (
          <IssueItem
            key={`error-${index}-${issue.code}-${issue.cue ?? "file"}`}
            issue={issue}
            index={index}
            kind="error"
            source={source}
            caps={caps}
            onToggleDetail={toggleDetail}
          />
        ))}
      </List.Section>

      <List.Section title="Warnings" subtitle={`${warnings.length}`}>
        {warnings.map((issue, index) => (
          <IssueItem
            key={`warn-${index}-${issue.code}-${issue.cue ?? "file"}`}
            issue={issue}
            index={index}
            kind="warn"
            source={source}
            caps={caps}
            onToggleDetail={toggleDetail}
          />
        ))}
      </List.Section>

      <List.Section title="Cues" subtitle={`${stats.cues.length}`}>
        {stats.cues.map((cue) => {
          const cueIssues = lint.issues.filter((issue) => issue.cue === cue.cue);
          const hasError = cueIssues.some((issue) => issue.severity === "error");
          const timing = cue.start && cue.end ? `${cue.start} → ${cue.end}` : "Missing timing";
          const notes = cueIssues.length
            ? cueIssues.map((issue) => `- ${issue.message}`).join("\n")
            : "No issues on this cue.";
          return (
            <List.Item
              key={`cue-${cue.cue}`}
              title={`Cue ${cue.cue}`}
              subtitle={timing}
              icon={
                hasError
                  ? { source: Icon.ExclamationMark, tintColor: Color.Red }
                  : cueIssues.length
                    ? { source: Icon.Warning, tintColor: Color.Orange }
                    : Icon.Text
              }
              accessories={[
                { text: cue.cps != null ? `${cue.cps} CPS` : "No CPS" },
                { text: `${cue.chars} ch` },
                { text: cue.durationMs != null ? `${(cue.durationMs / 1000).toFixed(2)}s` : "—" },
              ]}
              detail={<List.Item.Detail markdown={`${cueMarkdown(source.text, cue.cue)}\n\n${notes}`} />}
              actions={<ReportActions source={source} caps={caps} onToggleDetail={toggleDetail} />}
            />
          );
        })}
      </List.Section>
    </List>
  );
}

export function EmptyReport(props: { title: string; description: string }) {
  return (
    <List>
      <List.EmptyView icon={Icon.Document} title={props.title} description={props.description} />
    </List>
  );
}
