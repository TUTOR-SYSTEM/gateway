#!/usr/bin/env node
// PreToolUse hook (Write|Edit): deny edits to protected files.
//   - .env / .env.* — hold secrets; Claude asks before editing them.
//   - drizzle/**    — generated migrations; edit src/database/schema.ts, then run
//                      `bun run db:generate`. Gateway owns the canonical schema + migration
//                      history for the shared Postgres DB (2026-09-28 consolidation).
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

  const rules = [
    {
      re: /(^|\/)\.env(\.[^/]+)?$/,
      why: '.env files hold secrets — confirm before Claude edits them.',
      decision: 'ask',
    },
    {
      re: /(^|\/)drizzle\//,
      why: 'drizzle/ migrations are generated. Edit src/database/schema.ts, then run `bun run db:generate`.',
      decision: 'deny',
    },
  ];

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
