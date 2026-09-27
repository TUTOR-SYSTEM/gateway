---
name: generate-service
description: Does NOT apply to gateway — gateway has no service layer. Redirects to the owning service's repo. Use only to recognize and correct a request to add a {name}.service.ts here.
---

# Generate Service — not applicable in gateway

Gateway owns **no business logic**, so there is no `{name}.service.ts` layer here — see
`.claude/rules/nestjs-feature-pattern.md`. If someone asks to "generate a service" for a
gateway feature, that logic belongs in the owning service's own repo instead:

- `user` repo, for auth/user/admin/student
- `tutor-service` repo, for the education domain
- `third-service` repo, for email/notification/redis/upload

Run that repo's own `generate-service` skill there (each of the other three services has its
own full service/repository layering and its own copy of this skill name). Back in gateway, the
feature only needs `generate-controller` (a thin `RmqProducer.send(...)` proxy) + `generate-module`, or
use the root `add-rpc-endpoint` skill to scaffold both the gateway call site and the owning
service's `@MessagePattern` handler together.
