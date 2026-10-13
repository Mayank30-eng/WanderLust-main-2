const Listing = require("../models/listing");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAX_SAFE_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const rootResolvers = {
  listings: async (args) => {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      limit = DEFAULT_LIMIT,
      offset = 0,
    } = args || {};

    // 1. Input validation
    if (minPrice !== undefined && minPrice !== null) {
      if (typeof minPrice !== "number" || minPrice < 0) {
        throw new Error("Invalid input: minPrice must be a non-negative number.");
      }
    }

    if (maxPrice !== undefined && maxPrice !== null) {
      if (typeof maxPrice !== "number" || maxPrice < 0) {
        throw new Error("Invalid input: maxPrice must be a non-negative number.");
      }
    }

    if (
      minPrice !== undefined &&
      minPrice !== null &&
      maxPrice !== undefined &&
      maxPrice !== null &&
      minPrice > maxPrice
    ) {
      throw new Error("Invalid input: minPrice cannot be greater than maxPrice.");
    }

    if (limit !== undefined && limit !== null) {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Invalid input: limit must be an integer greater than or equal to 1.");
      }
    }

    if (offset !== undefined && offset !== null) {
      if (!Number.isInteger(offset) || offset < 0) {
        throw new Error("Invalid input: offset must be a non-negative integer.");
      }
    }

    const safeLimit = Math.min(limit || DEFAULT_LIMIT, MAX_SAFE_LIMIT);
    const safeOffset = offset || 0;

    // 2. Build MongoDB query
    const mongoQuery = {};

    if (category && typeof category === "string") {
      const cleanCategory = category.trim();
      if (cleanCategory.length > 50) {
        throw new Error("Invalid input: category filter exceeds maximum length of 50 characters.");
      }
      if (cleanCategory.length > 0) {
        mongoQuery.category = {
          $regex: new RegExp(`^${escapeRegex(cleanCategory)}$`, "i"),
        };
      }
    }

    if (
      (minPrice !== undefined && minPrice !== null) ||
      (maxPrice !== undefined && maxPrice !== null)
    ) {
      mongoQuery.price = {};
      if (minPrice !== undefined && minPrice !== null) {
        mongoQuery.price.$gte = minPrice;
      }
      if (maxPrice !== undefined && maxPrice !== null) {
        mongoQuery.price.$lte = maxPrice;
      }
    }

    if (search && typeof search === "string") {
      const cleanSearch = search.trim();
      if (cleanSearch.length > 100) {
        throw new Error("Invalid input: search query exceeds maximum length of 100 characters.");
      }
      if (cleanSearch.length > 0) {
        const safeSearch = escapeRegex(cleanSearch);
        const searchRegex = { $regex: safeSearch, $options: "i" };
        mongoQuery.$or = [
          { title: searchRegex },
          { category: searchRegex },
          { location: searchRegex },
          { country: searchRegex },
        ];
      }
    }

    try {
      // 3. Query with projection and lean for optimal memory and response time
      const listings = await Listing.find(mongoQuery)
        .select("_id title description price location country category image")
        .skip(safeOffset)
        .limit(safeLimit)
        .lean();

      return listings.map((item) => ({
        id: item._id ? item._id.toString() : "",
        title: item.title || "",
        description: item.description || "",
        price: typeof item.price === "number" ? item.price : 0,
        location: item.location || "",
        country: item.country || "",
        category: item.category || "",
        image: item.image
          ? {
              filename: item.image.filename || "",
              url: item.image.url || "",
            }
          : null,
      }));
    } catch (err) {
      // Safe error handling without leaking internal DB stack details
      console.error("GraphQL listings query error:", err.message);
      throw new Error("Failed to retrieve listings from database.");
    }
  },
};

module.exports = rootResolvers;
