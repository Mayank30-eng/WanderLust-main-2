const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const BASE_URL = "http://127.0.0.1:8080";

async function postGraphQL(query, variables = {}) {
  const res = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function getUrl(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

test("GraphQL Suite - Read-only Listing Query and Filters", async (t) => {
  await t.test("1. Successfully retrieves listings with requested card fields", async () => {
    const query = `
      query GetListingCards($limit: Int) {
        listings(limit: $limit) {
          id
          title
          price
          location
          country
          category
          image {
            url
            filename
          }
        }
      }
    `;
    const res = await postGraphQL(query, { limit: 3 });
    assert.equal(res.status, 200);
    assert.ok(res.body.data, "Should return data");
    assert.ok(Array.isArray(res.body.data.listings), "listings should be an array");
    assert.equal(res.body.data.listings.length, 3, "Should return exactly 3 listings");

    const first = res.body.data.listings[0];
    assert.ok(first.id, "Listing must have an id");
    assert.ok(first.title, "Listing must have a title");
    assert.ok(typeof first.price === "number", "Price must be a number");
    assert.ok(first.category, "Listing must have a category");
    assert.ok(first.location, "Listing must have a location");
    assert.ok(first.country, "Listing must have a country");
    if (first.image) {
      assert.ok(first.image.url, "Image must have a url");
    }
  });

  await t.test("2. Category filter correctly filters listings", async () => {
    const query = `
      query FilterByCategory($category: String) {
        listings(category: $category) {
          id
          title
          category
        }
      }
    `;
    const res = await postGraphQL(query, { category: "Beach" });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.listings.length > 0, "Should find Beach listings");
    for (const item of res.body.data.listings) {
      assert.equal(item.category.toLowerCase(), "beach");
    }
  });

  await t.test("3. Price range filter works correctly", async () => {
    const query = `
      query FilterByPrice($minPrice: Float, $maxPrice: Float) {
        listings(minPrice: $minPrice, maxPrice: $maxPrice) {
          id
          title
          price
        }
      }
    `;
    const res = await postGraphQL(query, { minPrice: 1000, maxPrice: 2000 });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.listings.length > 0, "Should find listings in price range");
    for (const item of res.body.data.listings) {
      assert.ok(item.price >= 1000 && item.price <= 2000, `Price ${item.price} should be between 1000 and 2000`);
    }
  });

  await t.test("4. Search filter matches across title, category, location, and country", async () => {
    const query = `
      query SearchListings($search: String) {
        listings(search: $search) {
          id
          title
          location
          country
          category
        }
      }
    `;
    const res = await postGraphQL(query, { search: "Malibu" });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.listings.length > 0, "Should find Malibu listings");
    for (const item of res.body.data.listings) {
      const match =
        item.title.toLowerCase().includes("malibu") ||
        item.location.toLowerCase().includes("malibu") ||
        item.country.toLowerCase().includes("malibu") ||
        item.category.toLowerCase().includes("malibu");
      assert.ok(match, "Each returned listing should match the search term");
    }
  });

  await t.test("5. Pagination with limit and offset operates correctly", async () => {
    const query = `
      query Paginated($limit: Int, $offset: Int) {
        listings(limit: $limit, offset: $offset) {
          id
          title
        }
      }
    `;
    const firstTwo = await postGraphQL(query, { limit: 2, offset: 0 });
    const nextTwo = await postGraphQL(query, { limit: 2, offset: 2 });
    assert.equal(firstTwo.body.data.listings.length, 2);
    assert.equal(nextTwo.body.data.listings.length, 2);
    assert.notEqual(firstTwo.body.data.listings[0].id, nextTwo.body.data.listings[0].id, "Offset should shift results");
  });

  await t.test("6. Empty results return an empty array without crashing", async () => {
    const query = `
      query EmptyResults {
        listings(category: "NonExistentCategory999") {
          id
          title
        }
      }
    `;
    const res = await postGraphQL(query);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.listings, []);
  });

  await t.test("7. Invalid input returns a controlled error", async () => {
    const query = `
      query InvalidPrice {
        listings(minPrice: 5000, maxPrice: 1000) {
          id
        }
      }
    `;
    const res = await postGraphQL(query);
    assert.ok(res.body.errors, "Should return errors array");
    assert.ok(res.body.errors[0].message.includes("minPrice cannot be greater than maxPrice"));
  });

  await t.test("8. Negative offset produces a controlled error", async () => {
    const query = `
      query InvalidOffset {
        listings(offset: -5) {
          id
        }
      }
    `;
    const res = await postGraphQL(query);
    assert.ok(res.body.errors, "Should return errors array");
    assert.ok(res.body.errors[0].message.includes("offset must be a non-negative integer"));
  });
});

test("Existing REST and Application Compatibility Suite", async (t) => {
  await t.test("1. Existing REST /listings HTML page renders successfully (200 OK)", async () => {
    const res = await getUrl("/listings");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("WanderLust"), "Page should contain WanderLust title/brand");
    assert.ok(res.text.includes("listing-card"), "Page should contain listing cards");
  });

  await t.test("2. Existing REST Category Filter (/listings/filter/:id) works", async () => {
    const res = await getUrl("/listings/filter/Beach");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("listing-card"), "Filtered page should render listing cards");
  });

  await t.test("3. Existing REST Search (/listings/search?q=...) works", async () => {
    const res = await getUrl("/listings/search?q=Beach");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("listing-card"), "Search page should render listing cards");
  });

  await t.test("4. Existing REST Single Listing Show Page (/listings/:id) renders", async () => {
    // Get a valid listing ID first
    const gql = await postGraphQL("{ listings(limit: 1) { id } }");
    const id = gql.body.data.listings[0].id;
    const res = await getUrl(`/listings/${id}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("Leave a Review") || res.text.includes("Where you'll be"), "Should show listing details");
  });

  await t.test("5. Authentication and Protected Routes remain intact", async () => {
    // Accessing protected /listings/new without auth must redirect to /login
    const res = await getUrl("/listings/new");
    assert.equal(res.status, 302, "Unauthenticated access should redirect");
    assert.equal(res.headers.get("location"), "/login", "Should redirect to /login");

    // Login and Signup pages must render 200 OK
    const loginPage = await getUrl("/login");
    assert.equal(loginPage.status, 200);
    const signupPage = await getUrl("/signup");
    assert.equal(signupPage.status, 200);
  });

  await t.test("6. REST JSON endpoint /api/listings returns equivalent data for cards", async () => {
    const res = await fetch(`${BASE_URL}/api/listings?limit=3`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data), "Should return array of listings");
    assert.equal(data.length, 3);
    assert.ok(data[0].id && data[0].title);
  });
});
