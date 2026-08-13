import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import config from "../profile.config.mjs";
import sortConfig from "../sort.config.mjs";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const repositoriesPath = path.join(rootDirectory, "data", "repos.json");
const readmePath = path.join(rootDirectory, "README.md");

const languageStyles = {
  Go: { color: "00ADD8", logo: "go" },
  Kotlin: { color: "7F52FF", logo: "kotlin" },
  Swift: { color: "F05138", logo: "swift" },
  TypeScript: { color: "3178C6", logo: "typescript" },
};

function escapeMarkdown(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function staticBadge(message, color, options = {}) {
  const badgeMessage = encodeURIComponent(message).replaceAll("-", "--");
  const query = new URLSearchParams({ style: "flat-square" });

  if (options.logo) query.set("logo", options.logo);
  if (options.logoColor) query.set("logoColor", options.logoColor);

  return `https://img.shields.io/badge/${badgeMessage}-${color}?${query}`;
}

function image(alt, source) {
  return `![${alt}](${source})`;
}

function linkedImage(alt, source, target) {
  return `[${image(alt, source)}](${target})`;
}

function htmlImage(alt, source) {
  return `<img alt="${escapeHtml(alt)}" src="${escapeHtml(source)}">`;
}

function htmlLinkedImage(alt, source, target) {
  return `<a href="${escapeHtml(target)}">${htmlImage(alt, source)}</a>`;
}

function languageBadgeSource(language) {
  const style = languageStyles[language] ?? {
    color: "555555",
    logo: undefined,
  };
  return staticBadge(language, style.color, {
    logo: style.logo,
    logoColor: "white",
  });
}

function languageBadge(language, format = "markdown") {
  const source = languageBadgeSource(language);

  return format === "html" ? htmlImage(language, source) : image(language, source);
}

function repositoryBadges(repository, username) {
  const repositorySegment = encodeURIComponent(repository.name);
  const ownerSegment = encodeURIComponent(username);
  const badges = [];

  if (repository.homepage) {
    badges.push(
      linkedImage(
        "Website",
        staticBadge("website", "4285F4", {
          logo: "googlechrome",
          logoColor: "white",
        }),
        repository.homepage,
      ),
    );
  }

  if (repository.language) {
    badges.push(
      linkedImage(
        repository.language,
        languageBadgeSource(repository.language),
        repository.html_url,
      ),
    );
  }

  badges.push(
    linkedImage(
      "GitHub stars",
      `https://img.shields.io/github/stars/${ownerSegment}/${repositorySegment}?style=flat-square&label=stars&color=yellow`,
      `${repository.html_url}/stargazers`,
    ),
    linkedImage(
      "Last commit",
      `https://img.shields.io/github/last-commit/${ownerSegment}/${repositorySegment}?style=flat-square&label=updated&color=blue`,
      `${repository.html_url}/commits`,
    ),
  );

  if (repository.fork) {
    badges.push(image("Fork", staticBadge("fork", "8A2BE2", { logo: "git" })));
  }

  if (repository.archived) {
    badges.push(image("Archived", staticBadge("archived", "777777", { logo: "github" })));
  }

  return badges.join(" ");
}

function repositoryList(repositories, username) {
  return repositories.map((repository) => {
    const description = escapeMarkdown(repository.description ?? "No description provided.");
    const name = `[**${escapeMarkdown(repository.name)}**](${repository.html_url})`;

    return `### ${name}\n\n${description}\n\n${repositoryBadges(repository, username)}`;
  }).join("\n\n");
}

function section(title, repositories, username) {
  if (repositories.length === 0) return null;
  return [`## ${title}`, repositoryList(repositories, username)].join("\n\n");
}

function sortByPriority(repositories, priorityNames = []) {
  const priority = new Map(
    priorityNames
      .filter((name) => typeof name === "string" && name.trim())
      .map((name, index) => [name, index]),
  );

  return repositories
    .map((repository, index) => ({ repository, index }))
    .sort((left, right) => {
      const leftPriority = priority.get(left.repository.name) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = priority.get(right.repository.name) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ repository }) => repository);
}

function hiddenRepositoryNames(profile, sorting) {
  return new Set([
    ...(profile.hiddenRepositories ?? []),
    ...(sorting.HIDEs ?? []).filter((name) => typeof name === "string" && name.trim()),
  ]);
}

function resolveSections(profile, repositories, hidden, sorting) {
  const byName = new Map(repositories.map((repository) => [repository.name, repository]));
  const assigned = new Set();
  const priorityKeys = {
    Apps: "APPs",
    Packages: "PKGs",
    Resources: "RESs",
  };
  const resolved = (profile.sections ?? []).map((configuredSection) => {
    const sectionRepositories = configuredSection.repositories.flatMap((name) => {
      if (hidden.has(name)) return [];

      if (assigned.has(name)) {
        throw new Error(`Repository \`${name}\` is assigned to more than one section.`);
      }

      const repository = byName.get(name);
      if (!repository) return [];

      assigned.add(name);
      return [repository];
    });
    const priorityKey = priorityKeys[configuredSection.title];

    return {
      title: configuredSection.title,
      repositories: sortByPriority(sectionRepositories, sorting[priorityKey] ?? []),
    };
  });
  const unassigned = repositories.filter(({ name }) => !assigned.has(name));

  if (unassigned.length > 0) {
    const fallback = resolved.find(({ title }) => title === profile.defaultSection);
    if (!fallback) {
      throw new Error(`Default section \`${profile.defaultSection}\` does not exist.`);
    }

    const priorityKey = priorityKeys[fallback.title];
    fallback.repositories = sortByPriority(
      [...fallback.repositories, ...unassigned],
      sorting[priorityKey] ?? [],
    );
  }

  return resolved;
}

export function renderReadme(profile, repositories, sorting = sortConfig) {
  const hidden = hiddenRepositoryNames(profile, sorting);
  const visible = repositories.filter((repository) => !hidden.has(repository.name));
  const languages = [...new Set(
    visible.map(({ language }) => language).filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, "en"));
  const languageBadges = languages
    .map((language) => languageBadge(language, "html"))
    .join(" ");

  const sections = resolveSections(profile, visible, hidden, sorting)
    .map(({ title, repositories: sectionRepositories }) => (
      section(title, sectionRepositories, profile.username)
    ))
    .filter(Boolean);

  return [
    "<!-- This file is generated by `npm run build`. Edit `profile.config.mjs` or `data/repos.json` instead. -->",
    "",
    `<h1 align="center">${escapeHtml(profile.title)}</h1>`,
    "",
    `<p align="center">${escapeHtml(profile.intro)}</p>`,
    "",
    `<p align="center">${languageBadges}</p>`,
    "",
    ...sections.flatMap((value) => [value, ""]),
    "<p align=\"center\"><sub>Badges powered by <a href=\"https://shields.io/\">Shields.io</a>.</sub></p>",
    "",
  ].join("\n");
}

async function readRepositories() {
  return JSON.parse(await readFile(repositoriesPath, "utf8"));
}

function normalizeRepository(repository) {
  return {
    name: repository.name,
    description: repository.description,
    html_url: repository.html_url,
    homepage: repository.homepage || null,
    language: repository.language,
    fork: repository.fork,
    archived: repository.archived,
  };
}

async function fetchRepositories(username) {
  const repositories = [];
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${username}-profile-readme-builder`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  for (let page = 1; ; page += 1) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`);
    url.search = new URLSearchParams({
      per_page: "100",
      sort: "updated",
      type: "owner",
      page: String(page),
    });

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
    }

    const pageRepositories = await response.json();
    if (!Array.isArray(pageRepositories)) {
      throw new TypeError("GitHub API returned an unexpected response.");
    }

    repositories.push(...pageRepositories.map(normalizeRepository));
    if (pageRepositories.length < 100) break;
  }

  return repositories;
}

async function main() {
  const check = process.argv.includes("--check");
  const refresh = process.argv.includes("--refresh");

  if (check && refresh) {
    throw new Error("Use either --check or --refresh, not both.");
  }

  const repositories = refresh
    ? await fetchRepositories(config.username)
    : await readRepositories();

  const readme = renderReadme(config, repositories);

  if (refresh) {
    await writeFile(repositoriesPath, `${JSON.stringify(repositories, null, 2)}\n`);
  }

  if (check) {
    const existing = await readFile(readmePath, "utf8").catch(() => "");
    if (existing !== readme) {
      throw new Error("README.md is out of date. Run `npm run build`.");
    }
    console.log("README.md is up to date.");
    return;
  }

  await writeFile(readmePath, readme);
  const hidden = hiddenRepositoryNames(config, sortConfig);
  const listedCount = repositories.filter(({ name }) => !hidden.has(name)).length;
  console.log(`Generated README.md with ${listedCount} listed repositories.`);
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
