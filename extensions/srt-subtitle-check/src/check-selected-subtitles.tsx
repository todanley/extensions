import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Action, ActionPanel, Color, Icon, List, getSelectedFinderItems } from "@raycast/api";
import { useEffect, useState } from "react";
import { EmptyReport, ReportList, type ReportSource } from "./results";

interface LoadedFile {
  path: string;
  text: string;
}

function isSrtPath(path: string): boolean {
  return path.toLowerCase().endsWith(".srt");
}

export default function Command() {
  const [files, setFiles] = useState<LoadedFile[] | undefined>();
  const [active, setActive] = useState<ReportSource | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const items = await getSelectedFinderItems();
        const srtItems = items.filter((item) => isSrtPath(item.path));
        if (srtItems.length === 0) {
          setError(
            items.length === 0
              ? "Select one or more .srt files in Finder, then run this command again."
              : "The selected Finder items are not .srt files. Select a SubRip file and try again.",
          );
          return;
        }
        const loaded: LoadedFile[] = [];
        for (const item of srtItems) {
          loaded.push({ path: item.path, text: await readFile(item.path, "utf8") });
        }
        setFiles(loaded);
        if (loaded.length === 1) {
          setActive({ label: basename(loaded[0].path), text: loaded[0].text, filePath: loaded[0].path });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not read the Finder selection.");
      }
    })();
  }, []);

  if (error) {
    return <EmptyReport title="No subtitle file selected" description={error} />;
  }
  if (!files) {
    return <EmptyReport title="Reading selected files…" description="Waiting for the Finder selection." />;
  }
  if (active) {
    return <ReportList source={active} />;
  }

  return (
    <List searchBarPlaceholder="Filter selected subtitle files…">
      <List.Section title="Selected Subtitle Files" subtitle={`${files.length}`}>
        {files.map((file) => (
          <List.Item
            key={file.path}
            title={basename(file.path)}
            subtitle={file.path}
            icon={Icon.Document}
            accessories={[{ tag: { value: ".srt", color: Color.Blue } }]}
            actions={
              <ActionPanel>
                <Action
                  title="Check This File"
                  icon={Icon.MagnifyingGlass}
                  onAction={() => setActive({ label: basename(file.path), text: file.text, filePath: file.path })}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
