# Application Architecture and Database Structure

This document is designed to help other AIs, developers, or data engineers understand our guided tour application's structural semantics, functionality, and Firebase Firestore schema. This is especially useful for creating peripheral scripts (e.g., Python scripts utilizing the `firebase-admin` SDK) to populate and maintain the database.

## 1. App Structure and Functionality

### Core Concept
The application is a location-aware, guided tour mobile-first web app. It tracks the user's GPS location and dynamically fetches Points of Interest (POIs) nearby. Leveraging the Google Places API alongside AI (OpenAI/Gemini), it provides contextual, voice-narrated information about historical landmarks, architecture, and other attractions. 

### Key Features
- **Active Guided Tours:** Using real-time geolocation to narrate information about nearby POIs as the user walks.
- **Tour Navigation:** Users can follow predefined or personalized routes (`tour_routes`) mapped out via selected POIs.
- **Interests Filtering:** Users can filter suggestions by categories (History, Culture, Architecture, Food, Art, Nature) which maps onto underlying Google Places types to segment the data.
- **Caching & Pre-fetching:** To minimize API calls, POI data and suggestions are cached in `poi_grids`. 
- **Groups & Collaborative Tours:** Users can form groups and assign group tours to coordinate experiences.
- **History & Tracking:** The system logs location history, visited POIs, and api usage.

---

## 2. Firestore Database Architecture

The application uses Firebase Firestore. Below is the blueprint of the database structure, detailing the collections, subcollections, underlying schema, and their relationships. 

### Global Collections

#### 1. `city_index` (`/city_index/{cityCode}`)
**Purpose:** Master index of supported cities for the application. Setting up a new city starts here.
**Schema:**
- `cityCode` (string, e.g., "NYC")
- `cityName` (string)
- `country` (string)
- `continent` (string)
- `centerCoordinates` (object: lat/lng)
- `boundingBox` (object)
- `defaultZoomLevel` (number)
- `timezone` (string)
- `availableLanguages` (array of strings)
- `totalPOIs` (number)
- `featuredPOIIds` (array of strings)
- `isActive` (boolean)

#### 2. `poi_grids` (`/poi_grids/{gridId}`)
**Purpose:** A geographic cache of Points of Interest. Prevents excessive calls to Google Places / OpenAI by caching known locations based on map grid IDs.
**Schema:**
- `gridId` (string)
- `cityCode` (string)
- `transportMode` (string)
- `places` (array of objects - detailed POI info)
- `updatedAt` (timestamp)
- `cacheExpiresAt` (timestamp)
- `lastRefreshedAt` (timestamp)
- `refreshPriority` (number)
- `curatedByAdmin` (boolean, optional) — `true` when this grid was written by the
  admin panel (`server/routes/admin.ts`) instead of an organic user visit.
  Curated grids get a much longer `cacheExpiresAt` (180 days) since they're
  manually vetted rather than opportunistically cached.
- `curatedLabel` (string, optional) — human label given by the admin (e.g.
  "Oficina Woobsing"), shown in the admin panel's "sitios ya poblados" list.
- `curatedBy` (string, optional) — uid of the admin who populated this grid.

#### 1b. `admins` (`/admins/{userId}`)
**Purpose:** Marks a user as a super admin. Mere existence of the document
grants access — `Document ID` is the user's `auth.uid`, and its fields are
informational only (see `isAdmin()` in `firestore.rules`). No client can ever
write to this collection directly (`firestore.rules` denies it outright); the
frontend instead asks the backend (`GET /api/admin/status`, see
`server/adminAuth.ts`) whether the signed-in user is an admin. That endpoint
is also the ONLY way a doc gets created here without a human doing it by hand:
the account matching `SUPER_ADMIN_EMAIL` (env var, defaults to
`julio.camacho@woobsing.com`) is auto-granted admin the very first time they
check — no manual Firestore step. Everyone else must be granted explicitly via
`npm run grant-admin <uid-or-email>` (Firebase Admin SDK, see
`scripts/grant-admin.ts`) or manually in the Firebase Console. This keeps
privilege escalation impossible from the client while still letting the
product owner start using the admin panel with zero setup.

The admin panel itself lives at the `/admin` path of the deployed app (same
origin, no separate host) — see the `ShieldCheck` button in `src/App.tsx`
and `src/components/screens/AdminPanel.tsx`. It has three tabs: **Resumen**
(today's estimated Google Places/OpenAI spend + daily budget + history),
**Sitios** (search-and-populate a site by address, plus a list of
admin-curated grids), and **Usuarios** (total registered users + the most
recently registered ones).

#### 3. `tour_routes` (`/tour_routes/{routeId}`)
**Purpose:** A curated set of POIs forming a route. Python scripts will frequently populate this collection with pre-made, high-quality tours (e.g., "Historic Downtown Rome").
**Schema:**
- `title` (string)
- `description` (string)
- `creatorId` (string - can be 'system' for auto-generated tours)
- `createdAt` (timestamp)
- `pois` (array of POI objects)
- `isPublic` (boolean)
- `type` (string: "personalized" | "system")

#### 4. `poi_suggestions` (`/poi_suggestions/{suggestionId}`)
**Purpose:** AI or user-driven suggestions for adding new POIs to the global directory.
- `suggestedBy`, `status`, `location`, `proposedName`, `proposedTypes`, `proposedDescription`, `votes`, `reviewedBy`, etc.

#### 5. `place_suggestions` (`/place_suggestions/{suggestionId}`)
**Purpose:** Proactive suggestions popped up to users while traveling based on context.

---

### User-Centric Collections

#### 1. `users` (`/users/{userId}`)
**Purpose:** Main user profile holding preferences (narrations styles, TTS speed, languages).
**Schema:** 
`displayName`, `firstName`, `lastName`, `email`, `favoriteCategories`, `onboardingComplete`, `ttsVoice`, `ttsSpeed`, etc.

**Subcollections under `users`:**
- **`location_history`** (`/users/{userId}/location_history/{historyId}`): Tracks user's physical locations over time.
- **`favorites`** (`/users/{userId}/favorites/{favoriteId}`): User's favorited POIs.
- **`visited_pois`** (`/users/{userId}/visited_pois/{visitId}`): POIs where the user has successfully triggered and listened to narration.
- **`api_usage`** (`/users/{userId}/api_usage/{dateId}`): Enforces individual API quotas to constrain OpenAI/Google usage costs.

#### 2. `user_trips` (`/user_trips/{tripId}`)
**Purpose:** A trip acts as a conceptual envelope for a period of travel (e.g., "Summer 2026 Eurotrip").
**Schema:** `userId`, `tripName`, `coverPhotoUrl`, `destinations`, `status`.

**Subcollections under `user_trips`:**
- **`trip_stops`** (`/user_trips/{tripId}/trip_stops/{stopId}`): Individual stops along that specific trip including timestamp and user generated notes/photos.

---

### Social & Collaboration Collections

#### 1. `groups` (`/groups/{groupId}`)
**Purpose:** Represents a group of users traveling together or sharing lists.
**Schema:** `name`, `description`, `creatorId`, `createdAt`.

**Subcollections under `groups`:**
- **`members`** (`/groups/{groupId}/members/{memberId}`): Links users to groups (`userId`, `role`, `joinedAt`).

#### 2. `group_tours` (`/group_tours/{tourId}`)
**Purpose:** Links a specific `tour_route` to a `group` with scheduling data.
**Schema:** `groupId`, `routeId`, `creatorId`, `scheduledAt`, `status`.

---

## 3. Populating Data via Python (Best Practices)

If writing a Python script using `firebase-admin` to populate elements like curated tours (`tour_routes`) or city indexes (`city_index`):

1. **Authentication:** Use a Firebase Service Account JSON key.
2. **Dates:** Always insert `updatedAt` / `createdAt` using Firestore `SERVER_TIMESTAMP` or Python `datetime.now(timezone.utc)`.
3. **Drafting Tours:** When inserting objects into `tour_routes`, set `type: "system"` and `isPublic: True` so that all app users immediately have access to these predefined lists. 
4. **Interests Alignment:** If enriching POIs, make sure to attach specific types aligned with the frontend filters (`History`, `Architecture`, `Food`, `Art`, `Nature`, `Culture`). 
5. **Batching:** Use Firestore `batch()` writes to insert bulk POIs or large tour definitions efficiently and atomically.
6. **Unique ID generation:** You can auto-generate doc IDs or use deterministic hashing (e.g., `md5(cityName)`) if you want to perform idempotent upserts without duplicating cities or tours.
