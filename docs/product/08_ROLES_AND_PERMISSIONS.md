# Narrowcasting Roles & Permissions Specification

- **Document ID:** PRODUCT-008
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the permission model of the Narrowcasting platform.

Permissions are not intended to restrict users unnecessarily.

Their purpose is to:

protect production

separate responsibilities

reduce mistakes

improve accountability

Permissions shall always follow business responsibilities.

## 2. Design Philosophy

Permissions are role-based.

Users receive one or more roles.

Roles grant capabilities.

The UI adapts to the available permissions.

Users should never see actions they cannot perform.

## 3. Core Roles

The platform defines five standard roles.

Installer

Content Manager

Campaign Manager

Operator

Administrator

Future releases may introduce custom roles.

## 4. Installer

## Purpose

Deploy hardware.

Responsibilities

Register Players

Approve Screens

Configure Screen Groups

Perform Diagnostics

Test Playback

## Cannot

Publish Campaigns

Delete Campaigns

Manage Users

## 5. Content Manager

## Purpose

Manage content.

## Can

Upload Media

Delete Media

Create Playlists

Create Programs

Edit Themes

## Cannot

Publish Campaigns

Modify Screens

Change Runtime Configuration

## 6. Campaign Manager

## Purpose

Publish content.

## Can

Create Campaigns

Schedule Campaigns

Publish Campaigns

Pause Campaigns

Resume Campaigns

Archive Campaigns

## Cannot

Modify Player Configuration

Manage Users

Delete Screens

## 7. Operator

## Purpose

Maintain operational continuity.

## Can

View Monitoring

Investigate Diagnostics

Acknowledge Alerts

Restart Publishing Jobs (future)

Pause Campaigns

Resume Campaigns

## Cannot

Edit Programs

Edit Themes

Change Platform Configuration

## 8. Administrator

## Purpose

Manage the platform.

## Can

Everything.

Including

Users

Permissions

Storage

Updates

Diagnostics

Overrides

Maintenance

Administrators should be few.

## 9. Future Roles

Reserved

Read Only

Marketing

Auditor

Regional Manager

Location Manager

API User

Service Account

## 10. Permission Categories

Permissions belong to one category.

Content

Publishing

Deployment

Monitoring

Administration

System

Future custom permissions shall fit into these categories.

## 11. Content Permissions

## Examples

Create Media

Edit Media

Delete Media

Create Playlist

Delete Playlist

Create Program

Delete Program

Edit Theme

## 12. Publishing Permissions

Create Campaign

Publish Campaign

Pause Campaign

Resume Campaign

Archive Campaign

Rollback Campaign

Approve Campaign (future)

## 13. Deployment Permissions

Register Screen

Approve Screen

Rename Screen

Delete Screen

Create Group

Delete Group

Assign Groups

## Future

Locations

## 14. Monitoring Permissions

View Monitoring

View Diagnostics

View Activity Log

Acknowledge Alerts

Resolve Alerts

Export Logs

## 15. Administration Permissions

Manage Users

Manage Roles

Manage Storage

Platform Updates

Maintenance Mode

Override Runtime

Delete Historical Data

## 16. UI Behaviour

Unavailable actions shall be:

Hidden

or

Disabled with explanation.

Never display actions that fail unexpectedly.

## 17. Ownership

Every object has an owner.

Campaign

->

Campaign Manager

Media

->

Content Manager

Player

->

Installer

Platform

->

Administrator

This ownership defines default permissions.

## 18. Audit Requirements

Every privileged action records

User

Timestamp

Action

Target

Result

Reason (optional)

Audit records cannot be modified.

## 19. Delegation

Future versions shall support

Multiple Administrators

Regional Administrators

Location Administrators

Delegated Campaign Managers

Without changing the permission model.

## 20. Enterprise Requirements

Permissions shall support

Single-user installations

->

Small organisations

->

Large enterprises

->

Multiple locations

->

Thousands of screens

## 21. Security Principles

Least Privilege

Users receive only permissions required.

Separation of Duties

Publishing and Administration remain independent.

Explicit Approval

High-risk operations require confirmation.

Auditability

Administrative actions are always logged.

## 22. Requirements

**REQ-PERM-001**

Every user SHALL belong to one or more roles.

**REQ-PERM-002**

Every role SHALL define capabilities.

**REQ-PERM-003**

Permissions SHALL control UI visibility.

**REQ-PERM-004**

Administrative actions SHALL be audited.

**REQ-PERM-005**

The platform SHALL support future custom roles.

**REQ-PERM-006**

The permission model SHALL remain independent from the Scheduler Resolver.

## 23. Future Extensions

Reserved

Single Sign-On

Active Directory

Azure AD

OpenID Connect

LDAP

Multi-factor Authentication

Approval Workflows

Delegated Administration

API Tokens

## 24. Definition of Done

The permission model is complete when

- Every role has a clear responsibility.

- Every capability belongs to one role category.

- UI adapts automatically.

- Audit records exist.

- Future expansion is possible.

- Runtime architecture remains unchanged.

## Relationship with Other Specifications

PRODUCT-001

Defines product philosophy.

PRODUCT-004

Defines workspaces.

PRODUCT-006

Defines Publishing.

PRODUCT-007

Defines Monitoring.

This document defines who may perform which actions.

---

## Document Navigation

- **Previous:** 07_MONITORING_AND_OPERATIONS.md
- **Next:** 09_OFFLINE_AND_SYNCHRONIZATION.md
- **Related specifications:** 04_WORKSPACES.md, 06_PUBLISHING_SPECIFICATION.md, 11_ACTIVITY_LOG_AND_AUDIT.md
