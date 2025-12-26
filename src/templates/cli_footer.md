
---
# SYSTEM INSTRUCTION: MANDATORY
Upon finishing the task, you MUST write a JSON file to the exact path below.
Do not output this JSON to the screen. Write it to the file.

You have the following signals available to you:
{{ allowed_signals }}

Target File: {{ signal_file_path }}

JSON Content Structure:
{
  "status": "SIGNAL_NAME",
  "reason": "Short explanation of result",
  "artifacts": ["path/to/file1", "path/to/file2"]
}
