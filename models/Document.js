const mongoose = require("mongoose")

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    ingestionId: { type: mongoose.Schema.Types.ObjectId, ref: "DomainIngestion", index: true, required: true },
    url: { type: String, required: true, index: true },
    host: { type: String, index: true },
    title: { type: String },
    content: { type: String }, // cleaned text
    wordCount: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    embeddingModel: { type: String },
    embedding: { type: [Number], select: false }, // optional, large
    hash: { type: String, index: true }, // dedup
    status: { type: String, enum: ["queued", "fetched", "processed"], default: "queued", index: true },
    error: { type: String }
  },
  { timestamps: true }
)

documentSchema.index({ ingestionId: 1, url: 1 }, { unique: true })

module.exports = mongoose.model("Document", documentSchema)
