# Narrowcasting Product Implementation Guidelines

- **Document ID:** PRODUCT-016
- **Version:** 3.0 (Draft)
- **Status:** Implementation Specification

---

## 1. Purpose

This document defines how future development is performed.

The previous Product documents define:

Why the product exists.

How users experience the product.

How the platform should behave.

This document defines how new functionality is implemented.

It is intended for:

Developers

Software Architects

AI Coding Assistants

Code Reviewers

## 2. Philosophy

Implementation follows the architecture.

Implementation follows the Product Specification.

Implementation never invents new behaviour.

Every feature should satisfy:

Architecture

->

Product Specification

->

Implementation

Never the opposite.

## 3. Development Order

Every feature follows the same lifecycle.

```text
Idea

->

Product Specification

->

Architecture Review

->

Implementation Plan

->

Implementation

->

Testing

->

Stable Tag
```

Implementation SHALL NOT begin before Product behaviour is defined.

## 4. Feature Requirements

Every new feature must answer:

```text
What problem does it solve
->

```

```text
Who uses it
->

```

```text
Which workspace owns it
->

```

```text
Which Product document defines it
->

```

```text
Which Architecture document defines it
->

```

```text
How is it tested
->

```

```text
How is it monitored
->

```

## 5. Architecture Compliance

No feature may violate:

Business Layer

Deployment Layer

Runtime Layer

Player Layer

The Scheduler Resolver remains authoritative.

The Player consumes resolved schedules only.

Runtime behaviour is never duplicated.

## 6. UX Compliance

Every page SHALL satisfy

PRODUCT-003

UX Foundations

PRODUCT-004

Workspace Specification

PRODUCT-015

Design System

Implementation may not invent its own interaction model.

## 7. Runtime Compliance

Implementation SHALL NOT

Duplicate Scheduler logic.

Modify runtime state from UI.

Expose runtime internals as business workflows.

Create alternative scheduling paths.

## 8. Feature Documents

Every significant feature should receive its own specification.

Example

```text
Campaign Lifecycle

->

Publishing

->

Implementation
```

Product Specification always precedes implementation.

## 9. Code Quality

## Requirements

Readable

Predictable

Testable

Maintainable

Modular

Self-documenting

Avoid clever solutions.

Prefer obvious solutions.

## 10. Backwards Compatibility

Stable behaviour shall remain stable.

Breaking changes require:

Migration

Documentation

Compatibility review

Stable Tag

## 11. Testing

Every implementation includes

Unit Tests (where applicable)

Integration Tests

Manual Verification

Enterprise Scale Review

Regression Review

UX Review

## 12. Stable Tags

Every completed feature receives

Commit

->

Verification

->

Stable Tag

->

Documentation Update

Stable tags represent known-good milestones.

## 13. AI-Assisted Development

AI assistants SHALL

Respect Product documents.

Respect Architecture.

Avoid technical debt.

Avoid speculative implementation.

Avoid unnecessary refactoring.

Never bypass the Scheduler Resolver.

Never duplicate runtime logic.

## 14. Code Reviews

Every review verifies

Architecture

Product Behaviour

UX

Security

Scalability

Maintainability

Documentation

Testing

Not only code correctness.

## 15. Documentation Updates

Every feature updates

Architecture (if required)

Product Specification (if required)

User Documentation (if required)

Developer Documentation (if required)

Documentation is part of implementation.

## 16. Enterprise Requirements

New features should consider

1 Screen

10 Screens

100 Screens

1000 Screens

Multiple Installations

Multiple Operators

Future Cloud

Future API

Future Mobile Monitoring

Implementation should never paint the product into a corner.

## 17. Product Evolution

New functionality should

Extend

Never replace

Existing concepts.

## Examples

Campaign Lifecycle

->

Approval Workflow

->

Emergency Override

->

Templates

->

AI Recommendations

All build upon existing concepts.

## 18. Anti-Patterns

Avoid

Large God Components

Duplicate Business Logic

Hidden Runtime Behaviour

Deeply Nested Navigation

Unexplained Automation

Feature Flags without documentation

Magic Constants

UI-driven Runtime Logic

## 19. AI Prompt Guidelines

Future implementation prompts should include

Architecture context

Relevant Product documents

Implementation scope

Explicit exclusions

Verification requirements

Expected deliverables

AI should receive specifications.

Not ideas.

## 20. Feature Completion Checklist

Before completion verify

Architecture respected

Product Specification followed

UX Foundations respected

Workspace ownership respected

No duplicated logic

No technical debt introduced

Documentation updated

Tests completed

Stable tag created

## 21. Requirements

**REQ-IMP-001**

Implementation SHALL follow Product Specifications.

**REQ-IMP-002**

Architecture SHALL remain authoritative.

**REQ-IMP-003**

Every feature SHALL have a responsible workspace.

**REQ-IMP-004**

Runtime logic SHALL never be duplicated.

**REQ-IMP-005**

Documentation SHALL evolve with implementation.

**REQ-IMP-006**

Stable Tags SHALL represent verified milestones.

**REQ-IMP-007**

AI-generated code SHALL follow these guidelines.

## 22. Definition of Done

A feature is complete only when

- Product Specification exists.

- Architecture respected.

- UX consistent.

- Documentation updated.

- Verification completed.

- Stable tag created.

- Future extensibility preserved.

## Relationship with Other Specifications

This document is the bridge between:

Architecture

->

Product Specification

->

Implementation

->

Stable Releases

It ensures the product evolves in a predictable, maintainable and scalable manner.

## Architect Notes

This document formalizes the development process itself.

From this point forward, the project should no longer grow through isolated features.

Instead, every addition follows the same chain:

```text
Product Specification

->

Architecture

->

Implementation

->

Verification

->

Stable Release
```

This approach keeps the platform consistent, prevents architectural drift, and makes AI-assisted development significantly more reliable.

Over time, these Product Specifications become the authoritative source for both human developers and AI coding assistants, allowing the Narrowcasting platform to evolve without accumulating technical debt.

---

## Document Navigation

- **Previous:** 15_DESIGN_SYSTEM.md
- **Next:** 17_WORKFLOWS_AND_NAVIGATION.md
- **Related specifications:** 00_PRODUCT_INDEX.md, ../architecture/ARCHITECTURE.md
