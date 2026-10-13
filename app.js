if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const { graphqlHandler } = require("./graphql");

app.use(express.static(path.join(__dirname, "/public")));
app.engine("ejs", ejsMate);
app.use(methodOverride("_method"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dbUrl = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(dbUrl);
}

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
  console.log("ERROR in MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use((req, res, next) => {
  res.locals.currUser = null;
  res.locals.success = [];
  res.locals.error = [];
  next();
});

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user || null;
  next();
});

app.get("/", (req, res) => {
  res.redirect("/listings");
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

// Mount GraphQL endpoint for read-only listing queries
app.all("/graphql", graphqlHandler);

// Optional REST JSON endpoint for listing cards (apples-to-apples comparison)
app.get("/api/listings", async (req, res, next) => {
  try {
    const { category, search, minPrice, maxPrice, limit = 50, offset = 0 } = req.query;
    const mongoQuery = {};
    if (category && typeof category === "string") {
      const cleanCategory = category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      mongoQuery.category = { $regex: new RegExp(`^${cleanCategory}$`, "i") };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      mongoQuery.price = {};
      if (minPrice !== undefined && minPrice !== "") mongoQuery.price.$gte = Number(minPrice);
      if (maxPrice !== undefined && maxPrice !== "") mongoQuery.price.$lte = Number(maxPrice);
    }
    if (search && typeof search === "string") {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = { $regex: safeSearch, $options: "i" };
      mongoQuery.$or = [
        { title: searchRegex },
        { category: searchRegex },
        { location: searchRegex },
        { country: searchRegex },
      ];
    }
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    const Listing = require("./models/listing");
    const listings = await Listing.find(mongoQuery)
      .select("_id title description price location country category image")
      .skip(safeOffset)
      .limit(safeLimit)
      .lean();

    res.json(
      listings.map((item) => ({
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
      }))
    );
  } catch (err) {
    next(err);
  }
});

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "Some Error Occured!" } = err;
  res.locals.currUser = req.user || res.locals.currUser || null;
  res.locals.success = res.locals.success || [];
  res.locals.error = res.locals.error || [];
  res.status(statusCode).render("./listings/error.ejs", { message });
});

const port = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
}

module.exports = app;
