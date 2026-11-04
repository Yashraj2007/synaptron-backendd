const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    // Remove deprecated options
    const conn = await mongoose.connect(process.env.MONGO_URI)

    console.log(`
🍃 ================================
   MONGODB CONNECTED SUCCESSFULLY
🍃 ================================
🔗 Host: ${conn.connection.host}
📊 Database: ${conn.connection.name}
🌐 Port: ${conn.connection.port}
🍃 ================================
    `)

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("🚨 MongoDB connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 MongoDB disconnected")
    })

    // Graceful shutdown
    process.on("SIGINT", async () => {
      await mongoose.connection.close()
      console.log("🛑 MongoDB connection closed through app termination")
      process.exit(0)
    })
  } catch (error) {
    console.error("🚨 MongoDB connection failed:", error.message)
    process.exit(1)
  }
}

module.exports = connectDB
