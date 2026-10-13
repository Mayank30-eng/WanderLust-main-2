require("dotenv").config();
const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const mongoUrl = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("connected to DB");
    return initDB();
  })
  .then(() => {
    console.log("DB is initialized");
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error("Error initializing DB:", err);
  });

async function main() {
  await mongoose.connect(mongoUrl);
}

const initDB = async () => {
  try {
    // Ensure default admin user exists
    let user = await User.findOne({ username: "admin" });
    if (!user) {
      const newUser = new User({
        _id: new mongoose.Types.ObjectId("66567b03fda820235197b582"),
        email: "admin@wanderlust.com",
        username: "admin",
      });
      user = await User.register(newUser, "admin123");
    }

    await Listing.deleteMany({});

    const updatedData = initData.data.map((obj) => {
      const listing = { ...obj };
      if (listing._id && listing._id.$oid) {
        listing._id = listing._id.$oid;
      }
      listing.owner = user._id;
      listing.reviews = [];
      listing.geometry = listing.geometry || {
        type: "Point",
        coordinates: [77.209, 28.6139],
      };
      delete listing.__v;
      return listing;
    });

    await Listing.insertMany(updatedData);
  } catch (error) {
    console.error("Error inside initDB:", error);
    throw error;
  }
};

