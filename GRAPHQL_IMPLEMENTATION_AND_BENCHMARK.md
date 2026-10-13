# WanderLust GraphQL Integration & Performance Benchmark Report

## 1. Architectural Scope & Rationale

### Why GraphQL Was Added Only to Listing Retrieval
WanderLust is an Express and EJS-based vacation rental web application. The core listing catalog (`/listings`) serves listing cards to users with essential summary attributes: title, price, location, country, category, and image URL.

GraphQL was introduced in exactly **ONE** place: **read-only listing card data retrieval and filtering** via the root query `listings`.

This targeted scope was chosen for specific architectural reasons:
1. **Zero Disruption to Existing Business Logic**: Full CRUD operations (listing creation, edit, deletion), Passport local authentication, user sessions, review submissions, Cloudinary uploads, and Mapbox geocoding remain untouched in their battle-tested REST controllers.
2. **High-Value Client Over-fetching Prevention**: Listing cards require only a subset of document fields. GraphQL enables clients (such as mobile apps or SPA components) to request precisely the card fields they need without modifying server endpoints.
3. **No Schema Duplication**: The GraphQL schema binds directly to the existing Mongoose `Listing` model and the existing MongoDB database connection. No separate database or duplicated model definitions were introduced.

---

## 2. GraphQL Schema, Endpoint & Example Queries

### Endpoint
- **URL**: `POST /graphql` (also accepts `GET /graphql` with query parameters)
- **Engine**: `graphql-http` with `graphql` v16

### Schema Definition
```graphql
type ListingImage {
  filename: String
  url: String
}

type Listing {
  id: ID!
  title: String!
  description: String
  price: Float
  location: String
  country: String
  category: String
  image: ListingImage
}

type Query {
  listings(
    search: String
    category: String
    minPrice: Float
    maxPrice: Float
    limit: Int
    offset: Int
  ): [Listing!]!
}
```

### Supported Filters & Safeguards
- **`category`**: Case-insensitive regex match against listing category.
- **`search`**: Case-insensitive search across `title`, `category`, `location`, and `country`. Special regex characters are escaped to prevent ReDoS.
- **`minPrice` / `maxPrice`**: Numeric price range boundaries. Controlled error thrown if `minPrice > maxPrice` or negative.
- **`limit`**: Clamped between 1 and 100 (default: 50) to prevent unbounded queries and memory exhaustion.
- **`offset`**: Non-negative integer for offset pagination.

### Example GraphQL Request

#### Query
```graphql
query GetListingCards($category: String, $minPrice: Float, $maxPrice: Float, $limit: Int) {
  listings(category: $category, minPrice: $minPrice, maxPrice: $maxPrice, limit: $limit) {
    id
    title
    price
    location
    country
    category
    image {
      url
    }
  }
}
```

#### Variables
```json
{
  "category": "Beach",
  "minPrice": 1000,
  "maxPrice": 2500,
  "limit": 10
}
```

#### Example `curl` Command
```bash
curl -X POST http://127.0.0.1:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { listings(category: \"Beach\", limit: 2) { id title price category image { url } } }"
  }'
```

#### Example JSON Response
```json
{
  "data": {
    "listings": [
      {
        "id": "66567c2f75f84fe592f66168",
        "title": "Cozy Beachfront Cottage",
        "price": 1500,
        "category": "Beach",
        "image": {
          "url": "https://res.cloudinary.com/dhawrroef/image/upload/v1716987958/wanderlust_DEV/qjqjlyldxwxw9qquteg0.jpg"
        }
      }
    ]
  }
}
```

---

## 3. How to Run the Application, Tests, and Benchmarks

### Environment Requirements
- Node.js: `v22.x` or higher
- MongoDB: Running locally at `mongodb://127.0.0.1:27017/wanderlust` (or configured via `ATLASDB_URL` in `.env`)

### Seed the Database
```bash
npm run seed
```

### Start the Application
```bash
npm start
# Server listens on http://127.0.0.1:8080
```

### Run Automated Tests
```bash
npm test
# Executes the 16 automated tests in tests/graphql-and-rest.test.js
```

### Run Benchmarks
```bash
# 1. Run baseline REST benchmark
npm run benchmark:baseline

# 2. Run post-implementation REST vs GraphQL comparison
npm run benchmark:compare
```

---

## 4. Performance Comparison: REST vs GraphQL

### Benchmarking Environment
- **Platform**: Darwin 27.0.0 (Apple M2, 8 cores, arm64)
- **Node.js**: v22.23.2 | **Express**: 4.21.2 | **GraphQL**: 16.14.2
- **Database**: Local MongoDB instance with 32 seeded listings
- **Test Tool**: Autocannon (2s warm-up, 3 iterations of 5s duration per test)

### Measured Results Table

| Scenario / API | Payload Format & Size | Concurrency | Req / Sec | Avg Latency | p50 (Median) | p95 Latency | p99 Latency | Error Rate |
|---|---|---|---|---|---|---|---|---|
| **Baseline REST** (`/listings`) | HTML (43,422 B) | c=1 | 125.93 | 7.37 ms | 7.00 ms | 9.67 ms | 11.00 ms | 0.0% |
| **Baseline REST** (`/listings`) | HTML (43,422 B) | c=10 | 138.67 | 71.24 ms | 70.00 ms | 114.00 ms | 132.33 ms | 0.0% |
| **Post-Change REST** (`/listings`) | HTML (43,422 B) | c=1 | 125.47 | 7.50 ms | 6.67 ms | 13.00 ms | 23.33 ms | 0.0% |
| **Post-Change REST** (`/listings`) | HTML (43,422 B) | c=10 | 171.67 | 57.34 ms | 56.00 ms | 88.00 ms | 110.00 ms | 0.0% |
| **GraphQL All Listings** (`/graphql`) | JSON (8,695 B) | c=1 | 157.00 | 5.92 ms | 5.67 ms | 12.33 ms | 16.33 ms | 0.0% |
| **GraphQL All Listings** (`/graphql`) | JSON (8,695 B) | c=10 | 205.73 | 48.01 ms | 45.33 ms | 76.00 ms | 119.67 ms | 0.0% |
| **REST JSON Equivalent** (`/api/listings`) | JSON (13,619 B) | c=1 | 111.00 | 8.49 ms | 8.33 ms | 10.67 ms | 12.67 ms | 0.0% |
| **REST JSON Equivalent** (`/api/listings`) | JSON (13,619 B) | c=10 | 148.01 | 66.93 ms | 63.67 ms | 107.33 ms | 131.00 ms | 0.0% |
| **REST Filter Beach** (`/listings/filter/Beach`) | HTML (16,294 B) | c=1 | 159.73 | 5.71 ms | 5.33 ms | 8.00 ms | 11.67 ms | 0.0% |
| **REST Filter Beach** (`/listings/filter/Beach`) | HTML (16,294 B) | c=10 | 204.73 | 48.17 ms | 47.67 ms | 71.33 ms | 84.00 ms | 0.0% |
| **GraphQL Filter Beach** (`/graphql`) | JSON (823 B) | c=1 | 153.60 | 6.02 ms | 6.00 ms | 9.33 ms | 12.67 ms | 0.0% |
| **GraphQL Filter Beach** (`/graphql`) | JSON (823 B) | c=10 | 188.27 | 52.25 ms | 49.00 ms | 91.00 ms | 134.00 ms | 0.0% |
| **REST Search Beach** (`/listings/search?q=Beach`) | HTML (19,134 B) | c=1 | 161.13 | 5.62 ms | 5.00 ms | 7.67 ms | 13.33 ms | 0.0% |
| **REST Search Beach** (`/listings/search?q=Beach`) | HTML (19,134 B) | c=10 | 198.27 | 49.79 ms | 48.33 ms | 73.00 ms | 90.00 ms | 0.0% |
| **GraphQL Search Beach** (`/graphql`) | JSON (1,611 B) | c=1 | 120.13 | 7.86 ms | 7.33 ms | 10.67 ms | 12.33 ms | 0.0% |
| **GraphQL Search Beach** (`/graphql`) | JSON (1,611 B) | c=10 | 104.73 | 95.40 ms | 91.00 ms | 160.00 ms | 212.67 ms | 0.0% |

---

## 5. Technical Performance Discussion: Reality vs Myths

### Myth: "GraphQL is inherently faster than REST"
**Reality**: GraphQL is **not inherently faster at the server runtime level**.
- For every GraphQL query, the server parses the request string, validates the query against the schema AST, executes individual field resolvers, and structures the response JSON.
- When querying MongoDB via Mongoose, both REST and GraphQL execute identical database operations (`find()`, `skip()`, `limit()`). The database time is identical.
- In CPU-bound scenarios under heavy concurrency, raw Express REST routes often exhibit slightly lower CPU overhead because they skip runtime AST validation.

### Where GraphQL Wins
1. **Payload Size Reduction**:
   - The full REST catalog transfers **43.4 KB** of HTML per request.
   - The GraphQL query requesting card fields transfers **8.69 KB** (an **80% reduction**).
   - In category filter queries, the REST response is 16.29 KB, while the GraphQL response is **823 Bytes** (a **94.9% reduction**).
   - On real-world 4G/5G mobile networks where latency and bandwidth are constrained, sending 823 bytes instead of 16 KB yields drastically faster Time-To-Interactive (TTI) and battery savings on client devices.
2. **Zero Over-fetching & Zero Under-fetching**:
   - Client views needing only `{ id, title, price }` can ask for exactly those 3 fields, cutting down payload even further.
   - Eliminates the need for creating custom one-off REST endpoints for every subtle UI card variant.

---

## 6. Preservation of Existing Application Functionality

1. **EJS Pages & Routes**:
   - `/listings` renders the full EJS catalog page with existing boilerplate, navbar, tax toggles, and filters.
   - `/listings/:id` renders the complete detail page with reviews and Mapbox map.
   - `/listings/new` renders the creation form and enforces user authentication.
2. **Passport Authentication & Sessions**:
   - Local authentication, session cookies, and login/signup redirects remain intact.
3. **Database Integrity**:
   - No models were altered; no database schemas were modified.
   - All tests confirm 100% backward compatibility.
