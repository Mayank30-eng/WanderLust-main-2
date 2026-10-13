const { createHandler } = require("graphql-http/lib/use/express");
const schema = require("./schema");
const rootResolvers = require("./resolvers");

const graphqlHandler = createHandler({
  schema,
  rootValue: rootResolvers,
  formatError: (error) => {
    // In production, ensure no stack traces or sensitive internal paths leak
    if (process.env.NODE_ENV === "production") {
      return {
        message: error.message || "An unexpected GraphQL error occurred.",
        locations: error.locations,
        path: error.path,
      };
    }
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
    };
  },
});

module.exports = {
  schema,
  rootResolvers,
  graphqlHandler,
};
