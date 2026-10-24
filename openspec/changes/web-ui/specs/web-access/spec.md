# Spec Delta

## Purpose

Keeps the household's photos, recordings, and item history private with one shared password, while leaving local development open when no password is configured.

## ADDED Requirements

### Requirement: Gate the UI when a password is set
When `UI_PASSWORD` is set, every screen and every UI API route SHALL require a valid session. Requests without one SHALL be sent to the sign-in screen (screens) or answered `401` (API routes).

#### Scenario: Signed out, screen
- **WHEN** a password is set and a visitor without a session opens the Items screen
- **THEN** they are redirected to sign in, and returned to the Items screen afterwards

#### Scenario: Signed out, API
- **WHEN** a password is set and `GET /api/items` is called without a session
- **THEN** the response is `401` with no item data

### Requirement: Open when no password is set
When `UI_PASSWORD` is empty or unset, screens and UI API routes SHALL be reachable without signing in.

#### Scenario: Local development
- **WHEN** no password is configured and a visitor opens the Ask screen
- **THEN** the screen loads without a sign-in step

### Requirement: Sign in and out
The sign-in screen SHALL accept the password, set a session that lasts 30 days, and show a plain error on a wrong password without saying more. A sign-out control SHALL end the session.

#### Scenario: Wrong password
- **WHEN** the visitor enters a wrong password
- **THEN** the screen says the password is wrong and no session is set

#### Scenario: Sign out
- **WHEN** a signed-in user signs out
- **THEN** the session ends and the next screen opened asks them to sign in

### Requirement: Pi endpoint uses its own token
`GET /api/jobs/next` SHALL authenticate only with the Pi's bearer token and SHALL NOT accept a UI session. UI routes SHALL NOT accept the Pi token.

#### Scenario: Pi token on a UI route
- **WHEN** `GET /api/items` is called with the Pi's bearer token and no session while a password is set
- **THEN** the response is `401`
