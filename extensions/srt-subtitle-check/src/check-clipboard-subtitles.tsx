import { Clipboard } from "@raycast/api";
import { useEffect, useState } from "react";
import { EmptyReport, ReportList } from "./results";

export default function Command() {
  const [text, setText] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    Clipboard.readText()
      .then((value) => setText(value ?? ""))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not read the clipboard."));
  }, []);

  if (error) {
    return <EmptyReport title="Could not read the clipboard" description={error} />;
  }
  if (text == null) {
    return <EmptyReport title="Reading clipboard…" description="Waiting for clipboard text." />;
  }
  if (!text.trim()) {
    return (
      <EmptyReport
        title="Clipboard is empty"
        description="Copy a SubRip (.srt) document, then run Check Clipboard Subtitles again."
      />
    );
  }

  return <ReportList source={{ label: "Clipboard", text }} />;
}
