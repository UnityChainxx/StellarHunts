# ADR-0003: NestJS Modular Monolith Over Microservices

**Date:** 2025-07-24  
**Status:** Accepted  
**Deciders:** StellarHunts backend team

---

## Context

StellarHunts requires a backend that handles authentication, puzzle
management, NFT claim orchestration, real-time multiplayer matchmaking,
notifications, referrals, analytics, and more. These are distinct
domains, so the question arose: should the backend be structured as a
**microservices** cluster or a **monolith**?

The team evaluated three architectural patterns:

| Pattern | Deployment | Scaling | Complexity | Team size fit |
|---------|-----------|---------|------------|---------------|
| Unstructured monolith | Single process | Vertical only | Low initially | Small |
| Modular monolith | Single process | Vertical + horizontal replicas | Medium | Small–medium |
| Microservices | Many processes | Per-service horizontal | High | Large |

Key constraints at the time of decision:
- Team of fewer than 10 engineers
- Early-stage product — domain boundaries still evolving
- Single PostgreSQL instance; cross-service transactions would be complex
- Redis already required for Socket.IO adapter and rate limiting
- Need to ship quickly and iterate

## Decision

The backend is a **NestJS modular monolith**.

- All domains live under `backend/src/` as NestJS feature modules
  (`@Module()` decorated classes).
- Each module owns its controller, service, entities, and DTOs.
- Cross-domain calls happen through NestJS dependency injection (imported
  modules), **not** via HTTP or a message bus.
- The monolith is deployed as a single Docker container / process;
  horizontal scaling is achieved by running multiple replicas behind a
  load balancer with Redis as the shared session/socket adapter.

If a specific domain needs independent scaling in the future (e.g.,
the multiplayer matchmaking gateway), it can be extracted into a
standalone NestJS microservice using the built-in `@nestjs/microservices`
transport layer with minimal refactoring because the module boundary
already exists.

## Consequences

### Positive
- Single deployment unit — simpler CI/CD and local development
- No distributed-transaction complexity; TypeORM transactions work across
  all domains
- NestJS DI container enforces explicit module boundaries without the
  operational overhead of separate services
- Straightforward to extract a module into a microservice later

### Negative / Trade-offs
- A poorly written module can import anything, eroding boundaries over
  time — code review must enforce the module contract
- A crash in one domain crashes the whole process (mitigated by process
  managers and health checks)
- Vertical scaling limits apply; the team must monitor whether any single
  domain (e.g., real-time sockets) becomes a bottleneck before extracting
  it
