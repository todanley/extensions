# SRT Subtitle Check

Lint SubRip (`.srt`) subtitles from the clipboard or a file selected in Finder. The command list shows numbering problems, invalid or missing timestamps, overlaps, reading speed (characters per second), and line length. You can copy a safely fixed document, or write those fixes back to the selected file.

This is a free side project. It does not use AI, network requests, or third-party accounts.

## Commands

- **Check Clipboard Subtitles** — lint the text currently on the clipboard.
- **Check Selected Subtitles** — lint the `.srt` file (or files) selected in Finder.

## Safe fixes

The optional fix action applies only safe edits:

- Renumber cues
- Normalize timestamp formatting
- Wrap long lines

Overlaps, negative durations, and similar structural problems are left for you to resolve. Writing fixes back to a selected file asks for confirmation first.

## Limits

Default limits follow common broadcast guidance and can be changed in the extension preferences:

- Latin cues: 42 characters per line, 21 characters per second
- CJK cues: 16 characters per line, 9 characters per second

Limits use grapheme counts (so a CJK character or an emoji counts as one).

## Notes

- The extension currently targets macOS because selected-file support uses Finder.
- Store screenshots have to be captured with Raycast's **Capture Window** command on macOS (2000×1250 PNG). They are not included yet.
- The `author` field must be an existing Raycast Store username. Replace `todanley` with that handle before opening a Store pull request if the two differ.
