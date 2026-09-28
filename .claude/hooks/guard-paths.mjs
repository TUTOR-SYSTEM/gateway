#!/usr/bin/env node
// PreToolUse hook (Write|Edit): deny edits to protected files.
//   - .env / .env.* — hold secrets, must be edited by a human.
//   - drizzle/**    — generated migrations; edit src/database/schema.ts, then run
//                      `bun run db:generate`. Gateway owns the canonical schema + migration
//                      history for the shared Postgres DB (2026-09-28 consolidation).
// Emits a PreToolUse permission "deny" as JSON; otherwise stays silent and allows the edit.
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

  const rules = [
    {
      re: /(^|\/)\.env(\.[^/]+)?$/,
      why: '.env files hold secrets — edit them manually, never through Claude.',
    },
    {
      re: /(^|\/)drizzle\//,
      why: 'drizzle/ migrations are generated. Edit src/database/schema.ts, then run `bun run db:generate`.',
    },
  ];

  for (const rule of rules) {
    if (rule.re.test(norm)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: rule.why,
          },
        }),
      );
      process.exit(0);
    }
  }

  process.exit(0);
});
