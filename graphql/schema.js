const { buildSchema } = require("graphql");

const schema = buildSchema(`
  """
  Represents image data for a WanderLust listing card.
  """
  type ListingImage {
    filename: String
    url: String
  }

  """
  Listing card representation matching WanderLust Mongoose schema.
  """
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

  """
  Root query with only 'listings' exposed for read-only listing card data and filtering.
  """
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
`);

module.exports = schema;
