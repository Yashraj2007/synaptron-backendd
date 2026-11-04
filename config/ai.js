module.exports = {
  models: {
    domain: process.env.AI_DOMAIN_MODEL || "meta-llama/llama-3-70b-instruct",
    extraction: process.env.AI_EXTRACTION_MODEL || "mistralai/mistral-7b-instruct",
    roadmap: process.env.AI_ROADMAP_MODEL || "anthropic/claude-3-sonnet"
  }
}
