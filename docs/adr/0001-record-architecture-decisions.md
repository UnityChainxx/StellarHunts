# ADR-0001: Record Architecture Decisions

**Date:** 2025-07-24  
**Status:** Accepted  
**Deciders:** StellarHunts core team

---

## Context

Architecture decisions in StellarHunts have historically been made in PR
descriptions, Discord threads, and informal team discussions. When a new
contributor joins, there is no single place to find *why* certain choices
were made — only *what* the current code does. This creates ramp-up
friction and leads to decisions being revisited unnecessarily.

## Decision

We will use Architecture Decision Records (ADRs) to capture significant
architectural and design decisions. Each ADR is a short Markdown document
stored in `docs/adr/` with a sequential four-digit prefix and a
kebab-case title.

ADRs should be created when:
- A technology or library is selected over alternatives
- A structural pattern is established (e.g., module layout, naming)
- An existing decision is reversed or superseded
- A design has meaningful trade-offs worth documenting

ADRs are **immutable once accepted**. Superseding an old decision means
creating a new ADR and updating the old one's status field.

### Template

```
# ADR-NNNN: <Title>

**Date:** YYYY-MM-DD  
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX  
**Deciders:** <team or individuals>

---

## Context
<What situation or problem prompted this decision?>

## Decision
<What was decided?>

## Consequences
### Positive
<Benefits of this choice.>
### Negative / Trade-offs
<Costs, risks, or constraints introduced.>
```

## Consequences

### Positive
- New contributors can understand system rationale without reading PRs
- Decisions are revisited deliberately rather than accidentally
- Lightweight process — one Markdown file per decision

### Negative / Trade-offs
- Requires discipline to write an ADR *before* merging significant changes
- ADRs can go stale if not kept up to date with status changes
