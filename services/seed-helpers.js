function slugifyKebab(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function slugifyWiki(input) {
  // Wikipedia typically uses Title_Case with underscores
  const cleaned = input
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join("_")
}

function deriveSeedsFromDomain(domain) {
  if (!domain || typeof domain !== "string") return []
  const kebab = slugifyKebab(domain)
  const wiki = slugifyWiki(domain)

  const seeds = new Set([
    // Wikipedia topic
    `https://en.wikipedia.org/wiki/${wiki}`,
    // GitHub topics
    `https://github.com/topics/${kebab}`,
    // Dev.to tag
    `https://dev.to/t/${kebab}`,
    // Medium topic/tag
    `https://medium.com/tag/${kebab}`,
  ])

  // Helpful defaults for popular areas
  const d = domain.toLowerCase()
  if (d.includes("web") || d.includes("javascript") || d.includes("react") || d.includes("frontend")) {
    seeds.add("https://developer.mozilla.org/en-US/docs/Web")
  }
  if (d.includes("python") || d.includes("data")) {
    seeds.add("https://docs.python.org/3/")
  }
  if (d.includes("blockchain") || d.includes("crypto")) {
    seeds.add("https://ethereum.org/en/developers/")
  }
  if (d.includes("ml") || d.includes("machine learning") || d.includes("ai")) {
    seeds.add("https://scikit-learn.org/stable/")
    seeds.add("https://pytorch.org/docs/stable/index.html")
  }
  if (d.includes("cyber") || d.includes("security")) {
    seeds.add("https://owasp.org/www-project-top-ten/")
  }
  if (d.includes("cloud")) {
    seeds.add("https://cloud.google.com/architecture")
  }

  // Return unique list with a sane cap
  return Array.from(seeds).slice(0, 8)
}

module.exports = { deriveSeedsFromDomain }
