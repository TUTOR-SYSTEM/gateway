---
name: generate-repository
description: Does NOT apply to gateway — gateway has no repository layer or database. Redirects to the owning service's repo. Use only to recognize and correct a request to add a {name}.repository.ts here.
---

# Generate Repository — not applicable in gateway

Gateway owns **no database and no repository layer** — see
`.claude/rules/nestjs-feature-pattern.md` and `../.claude/rules/architecture.md`. If someone
asks to "generate a repository" for a gateway feature, data access belongs in the owning
service's own repo instead:

- `user` repo, for auth/user/admin/student
- `tutor-service` repo, for the education domain
- `third-service` repo, for email/notification/redis/upload

Run that repo's own `generate-repository` skill there (each of the other three services has
Drizzle-backed repositories and its own copy of this skill name). Back in gateway, the feature
only needs `generate-controller` (a thin `RmqProducer.send(...)` proxy) + `generate-module`.
