#!/usr/bin/env node
// PreToolUse hook (Write|Edit): deny edits to protected files.
//   - .env files are NOT guarded: editing them is allowed without a prompt (user decision, 2026-11-28).
//   - drizzle/** is NOT guarded: editing it is allowed without a prompt (user decision, 2026-11-28).
// Emits a PreToolUse permission decision ("ask" or "deny") as JSON; otherwise allows the edit silently.
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input || '{}');
  } catch {
    process.exit(0);
  }

  const file = data?.tool_input?.file_path || '';
  const norm = file.replace(/\\/g, '/');

  const rules = [];

  for (const rule of rules) {
    if (rule.re.test(norm)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: rule.decision,
            permissionDecisionReason: rule.why,
          },
        }),
      );
      process.exit(0);
    }
  }

  process.exit(0);
});
