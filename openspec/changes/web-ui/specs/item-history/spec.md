# Spec Delta

## Purpose

Lets a person see where each tracked item was last seen and how often it goes missing, and look back through one item's sightings with the photo of each.

## ADDED Requirements

### Requirement: List tracked items
`GET /api/items` SHALL return every tracked item with its name, aliases, lost count, last-seen time (the newest sighting, or null), and the last sighting's signed snapshot URL and box when one exists. Items SHALL be ordered by last-seen time, newest first, with never-seen items last by name.

#### Scenario: Mixed history
- **WHEN** "wallet" was last seen at 3:42 PM, "keys" at 9:10 AM, and "earbuds" never
- **THEN** the list is wallet, keys, earbuds, and earbuds has a null last-seen time and no snapshot

#### Scenario: No items
- **WHEN** no items are tracked
- **THEN** the response is `200` with an empty list

### Requirement: Items screen
The Items screen SHALL show each item's name, how long ago it was last seen with the exact time available, its lost count, and a thumbnail of its last snapshot with the item marked. Each item SHALL link to its history.

#### Scenario: Seen item
- **WHEN** "wallet" was last seen 12 minutes ago and has been lost 3 times
- **THEN** its row says "12 min ago", shows the exact time on hover or focus, shows "lost 3 times", and shows the marked thumbnail

#### Scenario: Never seen
- **WHEN** "earbuds" has no sightings
- **THEN** its row says "not seen yet" and shows no thumbnail, and its lost count prints as 0

#### Scenario: Empty state
- **WHEN** no items are tracked
- **THEN** the screen explains that items come from the trained model and keeps its layout

### Requirement: Item sightings API
`GET /api/items/:id/sightings` SHALL return the item's sightings newest first, each with its time, confidence, box, zone when known, and a signed snapshot URL. It SHALL return at most `limit` rows (default 50, maximum 200) and accept a `before` time to fetch older rows.

#### Scenario: Paging
- **WHEN** an item has 120 sightings and the client asks with the default limit
- **THEN** the 50 newest are returned, and asking again with `before` set to the oldest returned time gives the next 50

#### Scenario: Unknown item
- **WHEN** the id does not exist
- **THEN** the response is `404`

### Requirement: Item history screen
The item history screen SHALL show the item's name, lost count, and last-seen time at the top, then its sightings newest first with time, place (zone when known), confidence, and the snapshot with the box drawn. It SHALL load older sightings on request.

#### Scenario: Viewing history
- **WHEN** the user opens the wallet's history
- **THEN** the newest sighting's snapshot is shown largest with the wallet marked, followed by older sightings in time order

#### Scenario: Load older
- **WHEN** more sightings exist than are shown and the user asks for more
- **THEN** the next page is appended without reloading the screen
